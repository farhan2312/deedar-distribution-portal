import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  dayLogs,
  depots,
  schemeClaims,
  users,
  visits,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { formatISTDate, istDateString, istDayBounds } from "@/lib/date";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { Donut, type DonutSegment } from "@/components/ui/donut";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  cardTitle,
  computeDelta,
  DonutCard,
  HighlightList,
  IconTile,
  Kpi,
  MedalBadge,
  ScrollBoard,
  StatusRow,
  type Highlight,
  type KpiProps,
} from "../../_components/dashboard-ui";
import { CnfPicker } from "../_components/cnf-picker";
import { RefreshButton } from "../../supervisor/_components/refresh-button";
import { VisitTrend, type TrendPoint } from "../../supervisor/_components/visit-trend";

// ── Palettes ───────────────────────────────────────────────────────────────
const DEPOT_COLORS = ["#7B2FA0", "#4C8C2B", "#B9812E", "#128A82", "#C7263B", "#2E5FA3"];

/** Fixed per-SKU colours, shared with the KHQ + SO dashboards so a segment
 * reads as the same colour everywhere in the app. */
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

/** Retail counter types. Wholesale is excluded — it's the Depot portal's
 * concern, not the C&F's retail footprint view. */
const RETAIL_TYPES = ["Kirana", "Paan", "Tea Stall", "Vegetable Shop", "Others"] as const;
const TYPE_COLOR: Record<string, string> = {
  Kirana: "#7B2FA0",
  Paan: "#4C8C2B",
  "Tea Stall": "#B9812E",
  "Vegetable Shop": "#C7263B",
  Others: "#6B7280",
};

/** Competitor pressure escalates neutral → amber → red. */
const COMPETITOR_COLOR: Record<string, string> = {
  none: "#8CA0B3",
  local: "var(--warning)",
  national: "var(--danger)",
};
const COMPETITOR_LABEL_KEY: Record<string, string> = {
  none: "No competitor",
  local: "Local brands",
  national: "National brands",
};

const TREND_DAYS = 14;

// ── Date helpers ───────────────────────────────────────────────────────────
/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

function shiftDays(dateStr: string, days: number): string {
  return istDateString(new Date(anchor(dateStr).getTime() + days * 24 * 60 * 60 * 1000));
}

/** "Aug 6" short label for the trend x-axis. */
function shortDayLabel(dateStr: string): string {
  return anchor(dateStr).toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  });
}

/** IST month-to-date UTC window `[start, end)`. */
function istMtdBounds(instant: Date): { start: Date; end: Date } {
  const today = istDateString(instant);
  const start = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
  const { end } = istDayBounds(instant);
  return { start, end };
}

/** The SAME span of the previous month (days 1..today's day-of-month), so an
 * MTD comparison is like-for-like rather than full-month vs partial-month. */
function prevMtdBounds(instant: Date): { start: Date; end: Date } {
  const today = istDateString(instant);
  const yy = Number(today.slice(0, 4));
  const mm = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const pm = mm === 1 ? 12 : mm - 1;
  const py = mm === 1 ? yy - 1 : yy;
  const start = new Date(`${py}-${String(pm).padStart(2, "0")}-01T00:00:00+05:30`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + day);
  return { start, end };
}

/** Which stock band a raw packet count falls into. */
function bandForStock(n: number): string {
  if (n <= 0) return "Out of stock";
  if (n <= 10) return "Low (1–10)";
  if (n <= 50) return "Mid (11–50)";
  return "High (51+)";
}
const STOCK_BAND_COLOR: Record<string, string> = {
  "Out of stock": "#C7263B",
  "Low (1–10)": "#E0A100",
  "Mid (11–50)": "#4C8C2B",
  "High (51+)": "#128A82",
  "Not yet visited": "#8A8F98",
};
const STOCK_BAND_ORDER = ["Out of stock", "Low (1–10)", "Mid (11–50)", "High (51+)", "Not yet visited"];

/** Days since a timestamp, in whole IST days. `null` for never-visited. */
function daysSince(d: Date | null, now: Date): number | null {
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

export default async function HqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.accessRoles.includes("admin");
  const t = await getT();
  if (!user.accessRoles.includes("hq") && !isAdmin) {
    return <Notice title={t("C&F HQ")}>{t("You don't have C&F HQ access.")}</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs);
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);
  if (!selectedCnf) {
    return <Notice title={t("C&F HQ")}>{t("No C&F HQ set up yet.")}</Notice>;
  }

  const cnfDepots = await db.select().from(depots).where(eq(depots.cnfId, selectedCnf.id));
  const depotIds = cnfDepots.map((d) => d.id);
  const hasDepots = depotIds.length > 0;

  const now = nowInstant();
  const today = istDateString(now);
  const day = istDayBounds(now);
  const mtd = istMtdBounds(now);
  const prevMtd = prevMtdBounds(now);
  const trendStart = new Date(day.end.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000);

  /** Scope predicate reused by every visit-based query below. */
  const inScope = inArray(counters.depotId, depotIds);

  // Everything runs in parallel — a dashboard is exactly where sequential
  // awaits multiply the DB round-trip cost.
  const [
    counterRows,
    todayTotals,
    mtdTotals,
    prevMtdTotals,
    dayLogRows,
    schemeTodayRow,
    schemeMtdRow,
    mtdItemsRows,
    trendRows,
    perDepotMtd,
    perAreaMtd,
    perRepMtd,
    competitorRows,
    rankRows,
  ] = await Promise.all([
    hasDepots
      ? db
          .select({
            id: counters.id,
            status: counters.status,
            type: counters.type,
            depotId: counters.depotId,
            name: counters.name,
            area: areas.name,
            lat: counters.lat,
            lng: counters.lng,
            phone: counters.phone,
            lastVisit: counters.lastVisitAt,
          })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inScope)
      : Promise.resolve([] as Array<{
          id: string; status: "active" | "dormant" | "declining"; type: string; depotId: string;
          name: string; area: string; lat: string | null; lng: string | null;
          phone: string | null; lastVisit: Date | null;
        }>),
    // Today: visits, packets, avg duration, distinct counters covered.
    hasDepots
      ? db
          .select({
            visits: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
            covered: sql<number>`count(distinct ${visits.counterId})::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, day.start), lt(visits.visitedAt, day.end)))
      : Promise.resolve([{ visits: 0, packets: 0, avgSeconds: 0, covered: 0 }]),
    // Month-to-date, plus distinct counters covered (→ coverage %) and avg rank.
    hasDepots
      ? db
          .select({
            visits: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            covered: sql<number>`count(distinct ${visits.counterId})::int`,
            avgRank: sql<number>`coalesce(avg(${visits.rank}), 0)::float`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
      : Promise.resolve([{ visits: 0, packets: 0, covered: 0, avgRank: 0 }]),
    // Same span last month.
    hasDepots
      ? db
          .select({
            visits: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, prevMtd.start), lt(visits.visitedAt, prevMtd.end)))
      : Promise.resolve([{ visits: 0, packets: 0 }]),
    // Rep clock-in state today. Raw (startAt, endAt) so JS can substitute
    // `now` for a still-open day — Postgres AVG can't do that portably.
    hasDepots
      ? db
          .select({ userId: dayLogs.userId, startAt: dayLogs.startAt, endAt: dayLogs.endAt })
          .from(dayLogs)
          .innerJoin(users, eq(users.id, dayLogs.userId))
          .where(
            and(
              eq(dayLogs.logDate, today),
              inArray(users.depotId, depotIds),
              sql`'field' = ANY(${users.accessRoles}::text[])`,
            ),
          )
      : Promise.resolve([] as Array<{ userId: string; startAt: Date | null; endAt: Date | null }>),
    hasDepots
      ? db
          .select({ value: sql<number>`coalesce(sum(${schemeClaims.value}), 0)::int` })
          .from(schemeClaims)
          .where(
            and(
              inArray(schemeClaims.depotId, depotIds),
              eq(schemeClaims.status, "paid"),
              gte(schemeClaims.createdAt, day.start),
              lt(schemeClaims.createdAt, day.end),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    hasDepots
      ? db
          .select({ value: sql<number>`coalesce(sum(${schemeClaims.value}), 0)::int` })
          .from(schemeClaims)
          .where(
            and(
              inArray(schemeClaims.depotId, depotIds),
              eq(schemeClaims.status, "paid"),
              gte(schemeClaims.createdAt, mtd.start),
              lt(schemeClaims.createdAt, mtd.end),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    // Product mix MTD — items JSONB aggregated in JS (a jsonb SRF join errors
    // on any non-array legacy row).
    hasDepots
      ? db
          .select({ items: visits.items })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
      : Promise.resolve([] as Array<{ items: VisitItem[] }>),
    // 14-day trend: visits AND packets per IST day in one grouped query.
    hasDepots
      ? db
          .select({
            d: sql<string>`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
            n: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, trendStart), lt(visits.visitedAt, day.end)))
          .groupBy(sql`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date`)
      : Promise.resolve([] as Array<{ d: string; n: number; packets: number }>),
    // Depot leaderboard, MTD.
    hasDepots
      ? db
          .select({
            depotId: counters.depotId,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            n: sql<number>`count(*)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
          .groupBy(counters.depotId)
      : Promise.resolve([] as Array<{ depotId: string; packets: number; n: number }>),
    // Area leaderboard, MTD.
    hasDepots
      ? db
          .select({ area: areas.name, packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int` })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
          .groupBy(areas.name)
      : Promise.resolve([] as Array<{ area: string; packets: number }>),
    // Rep leaderboard, MTD.
    hasDepots
      ? db
          .select({
            name: users.name,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            n: sql<number>`count(*)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .innerJoin(users, eq(users.id, visits.userId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
          .groupBy(users.name)
      : Promise.resolve([] as Array<{ name: string; packets: number; n: number }>),
    // Competitor presence MTD.
    hasDepots
      ? db
          .select({ competitor: visits.competitor, n: sql<number>`count(*)::int` })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end)))
          .groupBy(visits.competitor)
      : Promise.resolve([] as Array<{ competitor: string | null; n: number }>),
    // Deedar shelf-rank distribution MTD.
    hasDepots
      ? db
          .select({ rank: visits.rank, n: sql<number>`count(*)::int` })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(and(inScope, gte(visits.visitedAt, mtd.start), lt(visits.visitedAt, mtd.end), sql`${visits.rank} is not null`))
          .groupBy(visits.rank)
      : Promise.resolve([] as Array<{ rank: number | null; n: number }>),
  ]);

  // Latest observed stock per counter — needs the ids from the query above, so
  // it can't join the parallel batch. One indexed lookup.
  const retailCounters = counterRows.filter((c) => c.type !== "Wholesale");
  const stockRows = retailCounters.length
    ? await db
        .select({ counterId: visits.counterId, stock: visits.stock, visitedAt: visits.visitedAt })
        .from(visits)
        .where(inArray(visits.counterId, retailCounters.map((c) => c.id)))
        .orderBy(sql`${visits.visitedAt} desc`)
    : [];
  const latestStock = new Map<string, number>();
  for (const r of stockRows) if (!latestStock.has(r.counterId)) latestStock.set(r.counterId, r.stock);

  // ── Counter health ──────────────────────────────────────────────────────
  const totalCounters = counterRows.length;
  const activeCount = counterRows.filter((c) => c.status === "active").length;
  const dormantCount = counterRows.filter((c) => c.status === "dormant").length;
  const decliningCount = counterRows.filter((c) => c.status === "declining").length;
  const activePct = totalCounters === 0 ? 0 : Math.round((activeCount / totalCounters) * 100);
  const healthDonut: DonutSegment[] = [
    { label: t("Active"), value: activeCount, color: "var(--success)" },
    { label: t("Dormant"), value: dormantCount, color: "var(--warning)" },
    { label: t("Declining"), value: decliningCount, color: "var(--danger)" },
  ];

  // ── Visibility (GPS + mobile = reachable) ───────────────────────────────
  const visibleCount = counterRows.filter((c) => c.lat != null && c.lng != null && c.phone).length;
  const visibilityPct = totalCounters === 0 ? 0 : Math.round((visibleCount / totalCounters) * 100);

  // ── Rep roster today ────────────────────────────────────────────────────
  const startedReps = dayLogRows.filter((l) => l.startAt);
  const completedReps = dayLogRows.filter((l) => l.startAt && l.endAt).length;
  const runningReps = dayLogRows.filter((l) => l.startAt && !l.endAt).length;
  const perRepHours = startedReps.map((l) =>
    Math.max(0, ((l.endAt ?? now).getTime() - l.startAt!.getTime()) / (1000 * 60 * 60)),
  );
  const avgOnJobHours = perRepHours.length === 0 ? 0 : perRepHours.reduce((s, h) => s + h, 0) / perRepHours.length;

  // ── Totals + deltas ─────────────────────────────────────────────────────
  const packetsToday = todayTotals[0]?.packets ?? 0;
  const visitsToday = todayTotals[0]?.visits ?? 0;
  const coveredToday = todayTotals[0]?.covered ?? 0;
  const avgVisitSeconds = todayTotals[0]?.avgSeconds ?? 0;
  const packetsMtd = mtdTotals[0]?.packets ?? 0;
  const visitsMtd = mtdTotals[0]?.visits ?? 0;
  const coveredMtd = mtdTotals[0]?.covered ?? 0;
  const avgRankMtd = mtdTotals[0]?.avgRank ?? 0;
  const coveragePct = totalCounters === 0 ? 0 : Math.round((coveredMtd / totalCounters) * 100);
  const schemeToday = schemeTodayRow[0]?.value ?? 0;
  const schemeMtd = schemeMtdRow[0]?.value ?? 0;

  const packetsMtdDelta = computeDelta(packetsMtd, prevMtdTotals[0]?.packets ?? 0);
  const visitsMtdDelta = computeDelta(visitsMtd, prevMtdTotals[0]?.visits ?? 0);

  // ── Depot split (counters) + depot leaderboard (packets MTD) ────────────
  const depotColor = new Map(cnfDepots.map((d, i) => [d.id, DEPOT_COLORS[i % DEPOT_COLORS.length]]));
  const depotName = new Map(cnfDepots.map((d) => [d.id, d.name]));
  const depotSplit: DonutSegment[] = cnfDepots
    .map((d) => ({
      label: d.name,
      value: counterRows.filter((c) => c.depotId === d.id).length,
      color: depotColor.get(d.id) ?? "#6B7280",
    }))
    .filter((s) => s.value > 0);
  const depotSplitTotal = depotSplit.reduce((s, d) => s + d.value, 0);

  const mtdByDepot = new Map(perDepotMtd.map((r) => [r.depotId, r]));
  const depotBoard = cnfDepots
    .map((d) => ({
      name: d.name,
      packets: Number(mtdByDepot.get(d.id)?.packets ?? 0),
      visits: Number(mtdByDepot.get(d.id)?.n ?? 0),
      counters: counterRows.filter((c) => c.depotId === d.id).length,
      declining: counterRows.filter((c) => c.depotId === d.id && c.status === "declining").length,
    }))
    .sort((a, b) => b.packets - a.packets);
  const depotBoardMax = Math.max(1, ...depotBoard.map((d) => d.packets));

  // ── Area + rep leaderboards (MTD) ───────────────────────────────────────
  const areaBoard = perAreaMtd
    .map((r) => ({ name: r.area, packets: Number(r.packets) || 0 }))
    .filter((r) => r.packets > 0)
    .sort((a, b) => b.packets - a.packets);
  const areaBoardMax = Math.max(1, ...areaBoard.map((a) => a.packets));

  const repBoard = perRepMtd
    .map((r) => ({ name: r.name, packets: Number(r.packets) || 0, visits: Number(r.n) || 0 }))
    .filter((r) => r.packets > 0 || r.visits > 0)
    .sort((a, b) => b.packets - a.packets);
  const repBoardMax = Math.max(1, ...repBoard.map((r) => r.packets));

  // ── Product mix (MTD) ───────────────────────────────────────────────────
  const soldBySegment = new Map<string, number>();
  for (const row of mtdItemsRows) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!it || typeof it.segment !== "string") continue;
      soldBySegment.set(it.segment, (soldBySegment.get(it.segment) ?? 0) + (Number(it.sold) || 0));
    }
  }
  const mixTotal = [...soldBySegment.values()].reduce((s, n) => s + n, 0);
  const productDonut: DonutSegment[] = PRODUCT_SEGMENTS.filter((p) => (soldBySegment.get(p.value) ?? 0) > 0).map((p) => ({
    label: p.value,
    value: soldBySegment.get(p.value) ?? 0,
    color: SEGMENT_COLOR[p.value],
  }));

  // ── Counter type mix (retail only) ──────────────────────────────────────
  const typeCount = new Map<string, number>();
  for (const c of retailCounters) {
    const key = RETAIL_TYPES.includes(c.type as (typeof RETAIL_TYPES)[number]) ? c.type : "Others";
    typeCount.set(key, (typeCount.get(key) ?? 0) + 1);
  }
  const typeDonut: DonutSegment[] = RETAIL_TYPES.filter((ty) => (typeCount.get(ty) ?? 0) > 0).map((ty) => ({
    label: ty,
    value: typeCount.get(ty) ?? 0,
    color: TYPE_COLOR[ty] ?? "#6B7280",
  }));
  const typeTotal = retailCounters.length;

  // ── Last observed stock (retail only) ───────────────────────────────────
  const bandCount = new Map<string, number>();
  for (const c of retailCounters) {
    const s = latestStock.get(c.id);
    const key = s == null ? "Not yet visited" : bandForStock(s);
    bandCount.set(key, (bandCount.get(key) ?? 0) + 1);
  }
  const stockDonut: DonutSegment[] = STOCK_BAND_ORDER.filter((b) => (bandCount.get(b) ?? 0) > 0).map((b) => ({
    label: b,
    value: bandCount.get(b) ?? 0,
    color: STOCK_BAND_COLOR[b],
  }));

  // ── Competitor presence (MTD) ───────────────────────────────────────────
  const compCount = new Map<string, number>();
  for (const r of competitorRows) {
    const key = r.competitor ?? "none"; // null → treated as no competitor
    compCount.set(key, (compCount.get(key) ?? 0) + (Number(r.n) || 0));
  }
  const compTotal = [...compCount.values()].reduce((s, n) => s + n, 0);
  const contested = (compCount.get("local") ?? 0) + (compCount.get("national") ?? 0);
  const contestedPct = compTotal === 0 ? 0 : Math.round((contested / compTotal) * 100);
  const competitorDonut: DonutSegment[] = ["none", "local", "national"]
    .filter((k) => (compCount.get(k) ?? 0) > 0)
    .map((k) => ({ label: COMPETITOR_LABEL_KEY[k], value: compCount.get(k) ?? 0, color: COMPETITOR_COLOR[k] }));

  // ── Shelf rank distribution (MTD) ───────────────────────────────────────
  const rankCount = new Map<number, number>();
  for (const r of rankRows) if (r.rank != null) rankCount.set(r.rank, Number(r.n) || 0);
  const rankTotal = [...rankCount.values()].reduce((s, n) => s + n, 0);
  const rankMax = Math.max(1, ...rankCount.values());
  const rankBars = [1, 2, 3, 4, 5].map((r) => ({
    rank: r,
    n: rankCount.get(r) ?? 0,
    pct: Math.round(((rankCount.get(r) ?? 0) / rankMax) * 100),
  }));

  // ── Trends (14 days) ────────────────────────────────────────────────────
  const visitsByDay = new Map(trendRows.map((r) => [r.d, Number(r.n) || 0]));
  const packetsByDay = new Map(trendRows.map((r) => [r.d, Number(r.packets) || 0]));
  const trendDates = Array.from({ length: TREND_DAYS }, (_, i) => shiftDays(today, -(TREND_DAYS - 1 - i)));
  const packetTrend: TrendPoint[] = trendDates.map((d) => ({ label: shortDayLabel(d), value: packetsByDay.get(d) ?? 0 }));
  const visitTrend: TrendPoint[] = trendDates.map((d) => ({ label: shortDayLabel(d), value: visitsByDay.get(d) ?? 0 }));
  const packetTrendHasData = packetTrend.some((p) => p.value > 0);
  const visitTrendHasData = visitTrend.some((p) => p.value > 0);
  const peakPackets = Math.max(0, ...packetTrend.map((p) => p.value));

  // ── Attention list: declining + stale counters, worst first ─────────────
  const attention = counterRows
    .map((c) => ({
      id: c.id,
      name: c.name,
      area: c.area,
      depot: depotName.get(c.depotId) ?? "—",
      status: c.status,
      days: daysSince(c.lastVisit, now),
      lastVisit: c.lastVisit,
    }))
    .filter((c) => c.status === "declining" || c.days == null || c.days >= 14)
    // Never-visited first (days === null), then longest-since-visit.
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 12);

  // ── Highlights ──────────────────────────────────────────────────────────
  const highlights: Highlight[] = [];
  if (packetsMtdDelta.pct !== null && packetsMtdDelta.pct > 0) {
    highlights.push({ tone: "good", icon: "trendUp", text: `${t("Packets are")} ${packetsMtdDelta.pct}% ${t("ahead of last month.")}` });
  } else if (packetsMtdDelta.pct !== null && packetsMtdDelta.pct < 0) {
    highlights.push({ tone: "warn", icon: "trendDown", text: `${t("Packets are")} ${Math.abs(packetsMtdDelta.pct)}% ${t("behind last month.")}` });
  }
  if (coveragePct < 50 && totalCounters > 0) {
    highlights.push({ tone: "warn", icon: "store", text: `${t("Only")} ${coveragePct}% ${t("of counters visited this month.")}` });
  }
  if (visibilityPct < 90 && totalCounters > 0) {
    highlights.push({ tone: "warn", icon: "pin", text: `${totalCounters - visibleCount} ${t("counters missing GPS or mobile.")}` });
  }
  if (decliningCount > 0) {
    highlights.push({ tone: "bad", icon: "alert", text: `${decliningCount} ${t(decliningCount === 1 ? "counter is declining." : "counters are declining.")}` });
  }
  if (contestedPct >= 40 && compTotal > 0) {
    highlights.push({ tone: "warn", icon: "swords", text: `${contestedPct}% ${t("of visits saw a competitor on shelf.")}` });
  }
  if (highlights.length === 0) {
    highlights.push({ tone: "good", icon: "check", text: t("All good — nothing needs attention right now.") });
  }

  const kpis: KpiProps[] = [
    { icon: "box", tint: "#7B2FA0", label: t("Packets sold (MTD)"), value: packetsMtd.toLocaleString("en-IN"), sub: `${packetsToday} ${t("today")}`, delta: packetsMtdDelta, deltaLabel: t("vs last month") },
    { icon: "route", tint: "#2E9E5A", label: t("Visits (MTD)"), value: visitsMtd.toLocaleString("en-IN"), sub: `${visitsToday} ${t("today")}`, delta: visitsMtdDelta, deltaLabel: t("vs last month") },
    { icon: "store", tint: "#128A82", label: t("Coverage (MTD)"), value: `${coveragePct}%`, sub: `${coveredMtd}/${totalCounters} · ${coveredToday} ${t("today")}` },
    { icon: "star", tint: "#B9812E", label: t("Avg Deedar rank"), value: avgRankMtd > 0 ? avgRankMtd.toFixed(1) : "—", sub: t("shelf position, MTD") },
    { icon: "rupee", tint: "#4C8C2B", label: t("Scheme payouts (MTD)"), value: `₹${schemeMtd.toLocaleString("en-IN")}`, sub: `₹${schemeToday.toLocaleString("en-IN")} ${t("today")}` },
    { icon: "pin", tint: "#2E5FA3", label: t("Counter visibility"), value: `${visibilityPct}%`, sub: t("geo-tagged with mobile") },
    { icon: "users", tint: "var(--accent)", label: t("Reps active today"), value: `${startedReps.length}`, sub: `${completedReps} ${t("done")} · ${runningReps} ${t("running")}` },
    { icon: "clock", tint: "#8A6FBF", label: t("Avg on-job today"), value: avgOnJobHours > 0 ? `${avgOnJobHours.toFixed(1)}h` : "—", sub: avgVisitSeconds > 0 ? `${Math.round(avgVisitSeconds / 60)}m ${t("per visit")}` : t("no visits yet") },
    { icon: "alert", tint: "#C7263B", label: t("Declining counters"), value: String(decliningCount), sub: t("flagged for revisit"), tone: "bad" },
    { icon: "grid", tint: "#6B7280", label: t("Network"), value: String(totalCounters), sub: `${cnfDepots.length} ${t("depots")}` },
  ];

  return (
    <div>
      {/* Header + controls */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{selectedCnf.name}</h1>
          <p className="page-subtitle max-w-2xl">
            {t("Performance across every depot, area and rep in this C&F.")}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <RefreshButton />
          {isAdmin && allCnfs.length > 1 && <CnfPicker options={allCnfs} value={selectedCnf.id} />}
        </div>
      </div>

      {/* Context strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {formatISTDate(today)}
        </span>
        <span>·</span>
        <span>{cnfDepots.length} {t("depots")}</span>
        <span>·</span>
        <span>{totalCounters} {t("counters")}</span>
        <span>·</span>
        <span>{t("Month to date")}</span>
      </div>

      {!hasDepots ? (
        <Notice title={selectedCnf.name}>{t("No depots under this C&F yet.")}</Notice>
      ) : (
        <>
          {/* KPI grid */}
          <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
            {kpis.map((k) => (
              <Kpi key={k.label} {...k} t={t} />
            ))}
          </div>

          {/* Packets trend (wide) + counter health donut */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <section className="card flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <IconTile name="box" tint="#7B2FA0" />
                  <div>
                    <h6 style={cardTitle}>{t("Packets sold trend")}</h6>
                    <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Last 14 days")}</p>
                  </div>
                </div>
                <div className="flex-none text-right">
                  <div className="text-[18px] font-bold leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                    {peakPackets.toLocaleString("en-IN")}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{t("peak day")}</div>
                </div>
              </div>
              {!packetTrendHasData ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No sales in the last 14 days.")}</p>
              ) : (
                <VisitTrend points={packetTrend} unitLabel={t("packets")} color="#7B2FA0" />
              )}
            </section>

            <section className="card flex flex-col p-5">
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile name="heart" tint="var(--success)" />
                <div>
                  <h6 style={cardTitle}>{t("Counter health")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("By counter status")}</p>
                </div>
              </div>
              {totalCounters === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters mapped yet.")}</p>
              ) : (
                <div className="flex flex-1 items-center justify-center gap-5">
                  <Donut segments={healthDonut} size={124} centerValue={`${activePct}%`} centerLabel={t("active")} />
                  <div className="flex flex-col gap-2">
                    <StatusRow color="var(--success)" label={t("Active")} n={activeCount} total={totalCounters} />
                    <StatusRow color="var(--warning)" label={t("Dormant")} n={dormantCount} total={totalCounters} />
                    <StatusRow color="var(--danger)" label={t("Declining")} n={decliningCount} total={totalCounters} />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Visit trend (wide) + depot split donut */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <section className="card flex flex-col p-5">
              <div className="mb-2 flex items-center gap-3">
                <IconTile name="trendUp" tint="#2E9E5A" />
                <div>
                  <h6 style={cardTitle}>{t("Visit trend")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Last 14 days")}</p>
                </div>
              </div>
              {!visitTrendHasData ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No visits in the last 14 days.")}</p>
              ) : (
                <VisitTrend points={visitTrend} unitLabel={t("visits")} />
              )}
            </section>

            <section className="card flex flex-col p-5">
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile name="building" tint="#7B2FA0" />
                <div>
                  <h6 style={cardTitle}>{t("Counters by depot")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Coverage split")}</p>
                </div>
              </div>
              {depotSplitTotal === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters mapped yet.")}</p>
              ) : (
                <div className="flex flex-1 items-center justify-center gap-5">
                  <Donut segments={depotSplit} size={124} centerValue={depotSplitTotal} centerLabel={t("counters")} />
                  <div className="flex max-h-[132px] flex-col gap-2 overflow-y-auto pr-1">
                    {depotSplit.map((d) => (
                      <StatusRow key={d.label} color={d.color} label={d.label} n={d.value} total={depotSplitTotal} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Three donuts: product mix · competitor · counter type */}
          <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DonutCard
              icon="pieChart"
              tint="#128A82"
              title={t("Product mix")}
              sub={t("Packets sold MTD, by SKU")}
              segments={productDonut}
              total={mixTotal}
              centerValue={mixTotal.toLocaleString("en-IN")}
              centerLabel={t("packets")}
              empty={mixTotal === 0 ? t("No sales this month yet.") : undefined}
              t={t}
            />
            <DonutCard
              icon="swords"
              tint="#C7263B"
              title={t("Competitor presence")}
              sub={t("Visits MTD, by competition")}
              segments={competitorDonut}
              total={compTotal}
              centerValue={`${contestedPct}%`}
              centerLabel={t("contested")}
              empty={compTotal === 0 ? t("No visits this month yet.") : undefined}
              translateLabels
              t={t}
            />
            <DonutCard
              icon="store"
              tint="#4C8C2B"
              title={t("Counters by type")}
              sub={t("Retail counter types")}
              segments={typeDonut}
              total={typeTotal}
              centerValue={typeTotal.toLocaleString("en-IN")}
              centerLabel={t("counters")}
              empty={typeTotal === 0 ? t("No retail counters in scope yet.") : undefined}
              translateLabels
              t={t}
            />
          </div>

          {/* Depot leaderboard + shelf rank */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <section className="card flex flex-col p-5">
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile name="trophy" tint="#B9812E" />
                <div>
                  <h6 style={cardTitle}>{t("Depot leaderboard")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Packets sold MTD")}</p>
                </div>
              </div>
              {depotBoard.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No depots under this C&F yet.")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {depotBoard.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <MedalBadge rank={i + 1} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>{d.name}</span>
                          <span className="flex-none text-[12.5px] font-bold tabular-nums" style={{ color: d.packets > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
                            {d.packets.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ProgressBar pct={Math.round((d.packets / depotBoardMax) * 100)} height={7} color={i === 0 && d.packets > 0 ? "var(--success)" : "var(--accent)"} />
                        </div>
                        <div className="mt-1.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                          {d.visits} {t("visits")} · {d.counters} {t("counters")}
                          {d.declining > 0 && (
                            <span style={{ color: "var(--danger)" }}> · {d.declining} {t("declining")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card flex flex-col p-5">
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile name="star" tint="#B9812E" />
                <div>
                  <h6 style={cardTitle}>{t("Deedar shelf rank")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Visits MTD, by shelf position")}</p>
                </div>
              </div>
              {rankTotal === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No ranked visits this month yet.")}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rankBars.map((r) => (
                    <div key={r.rank} className="flex items-center gap-2.5">
                      <span className="w-7 flex-none text-[12.5px] font-bold" style={{ color: "var(--ink-1)" }}>#{r.rank}</span>
                      <div className="flex-1">
                        <ProgressBar
                          pct={r.pct}
                          height={12}
                          color={r.rank <= 2 ? "var(--success)" : r.rank === 3 ? "var(--warning)" : "var(--danger)"}
                        />
                      </div>
                      <span className="w-9 flex-none text-right text-[12px] font-bold tabular-nums" style={{ color: r.n > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
                        {r.n}
                      </span>
                    </div>
                  ))}
                  <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {t("Lower is better — #1 means Deedar leads the shelf.")}
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Rep leaderboard + area leaderboard */}
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <ScrollBoard
              icon="users"
              tint="var(--accent)"
              title={t("Top reps")}
              sub={t("Packets sold MTD")}
              empty={t("No rep activity this month yet.")}
              rows={repBoard.map((r) => ({
                key: r.name,
                name: r.name,
                value: r.packets.toLocaleString("en-IN"),
                pct: Math.round((r.packets / repBoardMax) * 100),
                meta: `${r.visits} ${t("visits")}`,
              }))}
            />
            <ScrollBoard
              icon="pin"
              tint="#128A82"
              title={t("Top areas")}
              sub={t("Packets sold MTD")}
              empty={t("No area activity this month yet.")}
              rows={areaBoard.map((a) => ({
                key: a.name,
                name: a.name,
                value: a.packets.toLocaleString("en-IN"),
                pct: Math.round((a.packets / areaBoardMax) * 100),
              }))}
            />
          </div>

          {/* Stock health + highlights */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <DonutCard
              icon="box"
              tint="#128A82"
              title={t("Last observed stock")}
              sub={t("Counters by last visit's stock level")}
              segments={stockDonut}
              total={typeTotal}
              centerValue={typeTotal.toLocaleString("en-IN")}
              centerLabel={t("counters")}
              empty={typeTotal === 0 ? t("No retail counters in scope yet.") : undefined}
              translateLabels
              t={t}
            />

            <section className="card flex flex-col p-5">
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile name="alert" tint="#C7263B" />
                <div>
                  <h6 style={cardTitle}>{t("Highlights")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("What needs your attention")}</p>
                </div>
              </div>
              <HighlightList items={highlights} />
            </section>
          </div>

          {/* Counters needing attention */}
          <section className="card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline-soft)" }}>
              <div className="flex items-center gap-3">
                <IconTile name="alert" tint="#C7263B" />
                <div>
                  <h6 style={cardTitle}>{t("Counters needing attention")}</h6>
                  <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Declining, or not visited in 14+ days")}</p>
                </div>
              </div>
              {attention.length > 0 && (
                <span className="chip flex-none" style={{ background: "rgba(199,38,59,.1)", color: "var(--danger)", borderColor: "transparent" }}>
                  {attention.length}
                </span>
              )}
            </div>
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
                {t("Nothing to flag — every counter is healthy and recently visited.")}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {["Counter", "Area", "Depot", "Status", "Last visit"].map((h) => (
                        <th key={h}>{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attention.map((c) => (
                      <tr key={c.id}>
                        <td className="font-semibold">{c.name}</td>
                        <td>{c.area}</td>
                        <td>{c.depot}</td>
                        <td>
                          <span
                            className="chip"
                            style={{
                              background: c.status === "declining" ? "rgba(199,38,59,.1)" : c.status === "dormant" ? "rgba(224,161,0,.12)" : "rgba(30,158,90,.12)",
                              color: c.status === "declining" ? "var(--danger)" : c.status === "dormant" ? "var(--warning)" : "var(--success)",
                              borderColor: "transparent",
                            }}
                          >
                            {t(c.status === "declining" ? "Declining" : c.status === "dormant" ? "Dormant" : "Active")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap" style={{ color: c.days == null ? "var(--danger)" : "var(--ink-2)" }}>
                          {c.days == null
                            ? t("Never visited")
                            : `${formatISTDate(c.lastVisit)} · ${c.days} ${t(c.days === 1 ? "day ago" : "days ago")}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
