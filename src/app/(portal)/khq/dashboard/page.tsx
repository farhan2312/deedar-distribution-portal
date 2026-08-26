import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  dayLogs,
  depots,
  schemeClaims,
  states,
  users,
  visits,
  type CompetitorPresence,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { formatISTDate, istDateString, istDayBounds } from "@/lib/date";
import { PRODUCT_SEGMENTS, COMPETITOR_LABEL } from "@/lib/field/products";
import { MONTH_SHORT } from "@/lib/khq/period";
import { resolveRange, shiftDays, trendGrain, type RangeParams } from "@/lib/khq/range";
import { getT } from "@/lib/i18n/server";
import { ProgressBar } from "@/components/ui/progress-bar";
import { type DonutSegment } from "@/components/ui/donut";
import {
  cardTitle,
  computeDelta,
  CardHead,
  DonutCard,
  Kpi,
  ScrollBoard,
  type BoardRow,
  type KpiProps,
} from "../../_components/dashboard-ui";
import { RefreshButton } from "../../supervisor/_components/refresh-button";
import { IsrLeaderboard } from "../_components/isr-leaderboard";
import { StatePicker } from "../_components/state-picker";
import { DateRangePicker } from "../_components/date-range-picker";
import { SalesTrend, type TrendBar } from "../_components/sales-trend";

// ── Palettes ───────────────────────────────────────────────────────────────
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

/** Retail counter types. Wholesale is excluded here to match the C&F and SO
 * dashboards — those outlets are the Depot portal's concern, and mixing them
 * in made the same chart describe a different population on each page. */
const RETAIL_TYPES = ["Kirana", "Paan", "Tea Stall", "Vegetable Shop", "Others"] as const;
const TYPE_COLOR: Record<string, string> = {
  Kirana: "#7B2FA0",
  Paan: "#4C8C2B",
  "Tea Stall": "#B9812E",
  "Vegetable Shop": "#C7263B",
  Others: "#6B7280",
};

/** Competitor pressure escalates neutral → amber → red. */
const COMPETITOR_COLOR: Record<CompetitorPresence, string> = {
  none: "#8CA0B3",
  local: "var(--warning)",
  national: "var(--danger)",
};

const STOCK_BAND_COLOR: Record<string, string> = {
  "Out of stock": "#C7263B",
  "Low (1–10)": "#E0A100",
  "Mid (11–50)": "#4C8C2B",
  "High (51+)": "#128A82",
  "Not yet visited": "#8A8F98",
};
const STOCK_BAND_ORDER = ["Out of stock", "Low (1–10)", "Mid (11–50)", "High (51+)", "Not yet visited"];

function bandForStock(n: number): string {
  if (n <= 0) return "Out of stock";
  if (n <= 10) return "Low (1–10)";
  if (n <= 50) return "Mid (11–50)";
  return "High (51+)";
}

function mmss(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

/** Last calendar day of an IST "YYYY-MM" month key. */
function monthEndOf(monthKey: string): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Days since a timestamp, in whole days. `null` for never-visited. */
function daysSince(d: Date | null, now: Date): number | null {
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

export default async function KhqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<RangeParams & { state?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  // Oldest visit sets the slider's floor — no point letting it scroll back
  // through years that can't contain data.
  const [earliest] = await db
    .select({
      d: sql<string | null>`min(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
    })
    .from(visits);

  const params = await searchParams;
  const range = resolveRange(params, earliest?.d ?? null);

  // State scope. Resolved before the aggregates so every query below can be
  // filtered by the same depot list: state → C&Fs → depots → counters.
  const stateRows = await db.select().from(states);
  const selectedState = stateRows.find((s) => s.id === params.state) ?? null;
  const scopedCnfs = selectedState
    ? await db.select({ id: cnfs.id }).from(cnfs).where(eq(cnfs.stateId, selectedState.id))
    : null;
  const scopedDepots = scopedCnfs
    ? await db
        .select({ id: depots.id })
        .from(depots)
        .where(scopedCnfs.length ? inArray(depots.cnfId, scopedCnfs.map((c) => c.id)) : sql`false`)
    : null;
  const scopedDepotIds = scopedDepots?.map((d) => d.id) ?? null;

  /** Counter-side scope predicate, or undefined company-wide. Every visit
   * query that uses it joins `counters`, since the state lives up that chain
   * rather than on the visit itself. */
  const depotScope = scopedDepotIds
    ? scopedDepotIds.length
      ? inArray(counters.depotId, scopedDepotIds)
      : sql`false`
    : undefined;

  const now = nowInstant();
  const day = istDayBounds(now);
  const today = istDateString(now);
  const inRange = and(gte(visits.visitedAt, range.start), lt(visits.visitedAt, range.end), depotScope);
  const inPrev = and(gte(visits.visitedAt, range.prevStart), lt(visits.visitedAt, range.prevEnd), depotScope);
  const inToday = and(gte(visits.visitedAt, day.start), lt(visits.visitedAt, day.end), depotScope);

  // All aggregates run in parallel — sequential awaits on a dashboard multiply
  // the DB round-trip cost.
  const [
    allStates,
    allCnfs,
    allDepots,
    allCounters,
    allReps,
    perDepotToday,
    todayTotals,
    activeRepsRows,
    periodMix,
    periodCore,
    prevCore,
    periodByDepot,
    periodByCnf,
    todayByIsr,
    periodByArea,
    competitorRows,
    rankRows,
    schemeRow,
    brandRows,
    trendRows,
    newCountersTodayRow,
    todayLogs,
  ] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db
      .select({
        id: counters.id,
        status: counters.status,
        depotId: counters.depotId,
        type: counters.type,
        name: counters.name,
        area: areas.name,
        lastVisit: counters.lastVisitAt,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(depotScope),
    db
      .select({ id: users.id, name: users.name, depotId: users.depotId, roles: users.accessRoles })
      .from(users)
      .where(scopedDepotIds ? inArray(users.depotId, scopedDepotIds) : undefined),
    // Per-depot activity TODAY — the bottom table stays a live "today" view
    // regardless of the selected period, which is what an ops table is for.
    db
      .select({
        depotId: counters.depotId,
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inToday)
      .groupBy(counters.depotId),
    db
      .select({ visits: sql<number>`count(*)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inToday),
    db.select({ userId: dayLogs.userId }).from(dayLogs).where(eq(dayLogs.logDate, today)),
    // Product mix — items JSONB aggregated in JS (a jsonb SRF join errors on
    // any non-array legacy row). NOTE: on a year view this pulls a year of
    // items; the heaviest query on the page.
    db
      .select({ items: visits.items })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inRange),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        covered: sql<number>`count(distinct ${visits.counterId})::int`,
        avgRank: sql<number>`coalesce(avg(${visits.rank}), 0)::float`,
        avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inRange),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inPrev),
    db
      .select({ depotId: counters.depotId, packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inRange)
      .groupBy(counters.depotId),
    // Per-C&F packets — the company-level cut a KHQ viewer actually wants,
    // and the one thing this dashboard can show that the C&F one can't.
    db
      .select({ cnfId: depots.cnfId, packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`, n: sql<number>`count(*)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .innerJoin(depots, eq(depots.id, counters.depotId))
      .where(inRange)
      .groupBy(depots.cnfId),
    db
      .select({
        id: users.id,
        name: users.name,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        n: sql<number>`count(*)::int`,
        counters: sql<number>`count(distinct ${visits.counterId})::int`,
      })
      .from(visits)
      .innerJoin(users, eq(users.id, visits.userId))
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inToday)
      .groupBy(users.id, users.name),
    db
      .select({ area: areas.name, packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(inRange)
      .groupBy(areas.name),
    db
      .select({ competitor: visits.competitor, n: sql<number>`count(*)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inRange)
      .groupBy(visits.competitor),
    db
      .select({ rank: visits.rank, n: sql<number>`count(*)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(and(inRange, sql`${visits.rank} is not null`))
      .groupBy(visits.rank),
    db
      .select({ value: sql<number>`coalesce(sum(${schemeClaims.value}), 0)::int` })
      .from(schemeClaims)
      .where(
        and(
          eq(schemeClaims.status, "paid"),
          gte(schemeClaims.createdAt, range.start),
          lt(schemeClaims.createdAt, range.end),
          scopedDepotIds ? inArray(schemeClaims.depotId, scopedDepotIds) : undefined,
        ),
      ),
    db
      .select({ brand: visits.competitorBrand, n: sql<number>`count(*)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(
        and(
          inRange,
          sql`${visits.competitor} <> 'none'`,
          sql`nullif(trim(${visits.competitorBrand}), '') is not null`,
        ),
      )
      .groupBy(visits.competitorBrand)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    // Trend buckets, keyed by the IST date itself rather than a day- or
    // month-of-year number. A free range can span year boundaries, where
    // "month 1" is ambiguous — the date is not.
    db
      .select({
        bucket:
          trendGrain(range.days) === "month"
            ? sql<string>`to_char(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`
            : sql<string>`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inRange)
      .groupBy(
        trendGrain(range.days) === "month"
          ? sql`to_char(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`
          : sql`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date`,
      ),
    // Counters added today.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(counters)
      .where(and(gte(counters.createdAt, day.start), lt(counters.createdAt, day.end), depotScope)),
    // Today's day logs — the pickup each ISR drew from the depot, which is the
    // target their sales are measured against on the board below.
    db
      .select({ userId: dayLogs.userId, pickupTotal: dayLogs.pickupTotal, startAt: dayLogs.startAt })
      .from(dayLogs)
      .where(eq(dayLogs.logDate, today)),
  ]);

  // Latest observed stock per retail counter — needs ids from the query above,
  // so it can't join the parallel batch.
  const retailCounters = allCounters.filter((c) => c.type !== "Wholesale");
  const stockRows = retailCounters.length
    ? await db
        .select({ counterId: visits.counterId, stock: visits.stock })
        .from(visits)
        .where(inArray(visits.counterId, retailCounters.map((c) => c.id)))
        .orderBy(desc(visits.visitedAt))
    : [];
  const latestStock = new Map<string, number>();
  for (const r of stockRows) if (!latestStock.has(r.counterId)) latestStock.set(r.counterId, r.stock);

  // ── Counter health ─────────────────────────────────────────────────────
  const activeCount = allCounters.filter((c) => c.status === "active").length;
  const dormantCount = allCounters.filter((c) => c.status === "dormant").length;
  const decliningCount = allCounters.filter((c) => c.status === "declining").length;
  const totalCounters = allCounters.length;
  const activePct = totalCounters === 0 ? 0 : Math.round((activeCount / totalCounters) * 100);
  const fieldReps = allReps.filter((r) => r.roles.includes("field"));

  const statusDonut: DonutSegment[] = [
    { label: t("Active"), value: activeCount, color: "var(--success)" },
    { label: t("Dormant"), value: dormantCount, color: "var(--warning)" },
    { label: t("Declining"), value: decliningCount, color: "var(--danger)" },
  ];

  // ── Counter type mix (retail only) ─────────────────────────────────────
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
  const retailTotal = retailCounters.length;

  // ── Last observed stock ────────────────────────────────────────────────
  const bandCount = new Map<string, number>();
  for (const c of retailCounters) {
    const s = latestStock.get(c.id);
    bandCount.set(
      s == null ? "Not yet visited" : bandForStock(s),
      (bandCount.get(s == null ? "Not yet visited" : bandForStock(s)) ?? 0) + 1,
    );
  }
  const stockDonut: DonutSegment[] = STOCK_BAND_ORDER.filter((b) => (bandCount.get(b) ?? 0) > 0).map((b) => ({
    label: b,
    value: bandCount.get(b) ?? 0,
    color: STOCK_BAND_COLOR[b],
  }));

  // ── Counters by state ───────────────────────────────────────────────────
  const depotToCnf = new Map(allDepots.map((d) => [d.id, d.cnfId]));
  const cnfToState = new Map(allCnfs.map((c) => [c.id, c.stateId]));
  const stateName = new Map(allStates.map((s) => [s.id, s.name]));
  const cnfName = new Map(allCnfs.map((c) => [c.id, c.name]));
  const stateCounts = new Map<string, number>();
  for (const c of allCounters) {
    const sid = cnfToState.get(depotToCnf.get(c.depotId) ?? "") ?? "";
    if (sid) stateCounts.set(sid, (stateCounts.get(sid) ?? 0) + 1);
  }
  const maxState = Math.max(1, ...stateCounts.values());
  const stateBars = [...stateCounts.entries()].map(([sid, count]) => ({
    name: stateName.get(sid) ?? "—",
    count,
    pct: Math.round((count / maxState) * 100),
  }));

  // ── Depot table (today) + leaderboards (period) ────────────────────────
  const perDepot = new Map(perDepotToday.map((r) => [r.depotId, r]));
  const depotName = new Map(allDepots.map((d) => [d.id, d.name]));
  const depotRows = allDepots.map((d) => {
    const dc = allCounters.filter((c) => c.depotId === d.id);
    const dr = fieldReps.filter((r) => r.depotId === d.id);
    const a = perDepot.get(d.id);
    return {
      name: d.name,
      cnf: cnfName.get(d.cnfId) ?? "—",
      reps: dr.length,
      counters: dc.length,
      visits: a?.visits ?? 0,
      packets: a?.packets ?? 0,
      avgCounterTime: mmss(a?.avgSeconds ?? 0),
      declining: dc.filter((c) => c.status === "declining").length,
    };
  });

  const depotBoard = periodByDepot
    .map((r) => ({ name: depotName.get(r.depotId) ?? "—", packets: Number(r.packets) || 0 }))
    .filter((r) => r.packets > 0)
    .sort((a, b) => b.packets - a.packets);
  const depotMax = Math.max(1, ...depotBoard.map((r) => r.packets));

  const cnfBoard = periodByCnf
    .map((r) => ({
      name: cnfName.get(r.cnfId) ?? "—",
      packets: Number(r.packets) || 0,
      visits: Number(r.n) || 0,
    }))
    .filter((r) => r.packets > 0 || r.visits > 0)
    .sort((a, b) => b.packets - a.packets);
  const cnfMax = Math.max(1, ...cnfBoard.map((r) => r.packets));

  // Built from the ROSTER, not from today's visits, so an ISR who has sold
  // nothing today still has a row — and so is still reachable. Ranking on a
  // visits aggregate alone silently hid exactly the people a company viewer
  // most wants to open.
  const todayByIsrId = new Map(todayByIsr.map((r) => [r.id, r]));
  const pickupByIsrId = new Map(todayLogs.map((l) => [l.userId, l]));
  const isrBoard = fieldReps
    .map((r) => {
      const a = todayByIsrId.get(r.id);
      const log = pickupByIsrId.get(r.id);
      return {
        id: r.id,
        name: r.name,
        packets: Number(a?.packets) || 0,
        visits: Number(a?.n) || 0,
        counters: Number(a?.counters) || 0,
        pickup: log?.pickupTotal ?? 0,
        started: !!log?.startAt,
      };
    })
    // Sellers first, then anyone who moved, then the rest alphabetically —
    // so the quiet ISRs sit in a predictable block rather than a random one.
    .sort((a, b) => b.packets - a.packets || b.visits - a.visits || a.name.localeCompare(b.name));

  const areaBoard = periodByArea
    .map((r) => ({ name: r.area, packets: Number(r.packets) || 0 }))
    .filter((r) => r.packets > 0)
    .sort((a, b) => b.packets - a.packets);
  const areaMax = Math.max(1, ...areaBoard.map((r) => r.packets));

  // ── Totals ──────────────────────────────────────────────────────────────
  const visitsToday = todayTotals[0]?.visits ?? 0;
  const activeRepsToday = new Set(activeRepsRows.map((r) => r.userId)).size;

  const packets = periodCore[0]?.packets ?? 0;
  const visitCount = periodCore[0]?.visits ?? 0;
  const covered = periodCore[0]?.covered ?? 0;
  const avgRank = periodCore[0]?.avgRank ?? 0;
  const avgVisitSeconds = periodCore[0]?.avgSeconds ?? 0;
  const coveragePct = totalCounters === 0 ? 0 : Math.round((covered / totalCounters) * 100);
  const schemePayout = schemeRow[0]?.value ?? 0;
  const newCountersToday = newCountersTodayRow[0]?.n ?? 0;

  const packetsDelta = computeDelta(packets, prevCore[0]?.packets ?? 0);
  const visitsDelta = computeDelta(visitCount, prevCore[0]?.visits ?? 0);

  // ── Product mix ─────────────────────────────────────────────────────────
  const soldBySegment = new Map<string, number>();
  for (const row of periodMix) {
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

  // ── Competitor presence ─────────────────────────────────────────────────
  const compCount = new Map<CompetitorPresence, number>();
  for (const r of competitorRows) {
    const key = (r.competitor ?? "none") as CompetitorPresence;
    compCount.set(key, (compCount.get(key) ?? 0) + (Number(r.n) || 0));
  }
  const compTotal = [...compCount.values()].reduce((s, n) => s + n, 0);
  const contested = (compCount.get("local") ?? 0) + (compCount.get("national") ?? 0);
  const contestedPct = compTotal === 0 ? 0 : Math.round((contested / compTotal) * 100);
  const competitorDonut: DonutSegment[] = (["none", "local", "national"] as CompetitorPresence[])
    .filter((k) => (compCount.get(k) ?? 0) > 0)
    .map((k) => ({ label: COMPETITOR_LABEL[k], value: compCount.get(k) ?? 0, color: COMPETITOR_COLOR[k] }));

  // ── Rank distribution ───────────────────────────────────────────────────
  const rankCount = new Map<number, number>();
  for (const r of rankRows) if (r.rank != null) rankCount.set(r.rank, Number(r.n) || 0);
  const rankTotal = [...rankCount.values()].reduce((s, n) => s + n, 0);
  const rankMax = Math.max(1, ...rankCount.values());
  const rankBars = [1, 2, 3, 4, 5].map((r) => ({
    rank: r,
    n: rankCount.get(r) ?? 0,
    pct: Math.round(((rankCount.get(r) ?? 0) / rankMax) * 100),
  }));

  const topBrands = brandRows.map((r) => ({ brand: (r.brand ?? "").trim(), n: Number(r.n) || 0 })).filter((r) => r.brand);

  // ── Trend bars ──────────────────────────────────────────────────────────
  // Buckets are generated from the RANGE, not from what the query returned, so
  // a day with no sales renders a zero bar instead of vanishing and silently
  // compressing the axis.
  const grain = trendGrain(range.days);
  const byBucket = new Map(trendRows.map((r) => [String(r.bucket), Number(r.packets) || 0]));

  const trendBars: TrendBar[] = [];
  if (grain === "month") {
    let cursor = `${range.from.slice(0, 7)}-01`;
    while (cursor.slice(0, 7) <= range.to.slice(0, 7)) {
      const key = cursor.slice(0, 7);
      const monthIdx = Number(key.slice(5, 7)) - 1;
      trendBars.push({
        // Translated here rather than only in the axis component — the labels
        // were rendering raw English beside a Hindi UI.
        label: t(MONTH_SHORT[monthIdx]),
        value: byBucket.get(key) ?? 0,
        // Clicking a month narrows the range to that month.
        drillMonth: monthIdx + 1,
        drillFrom: `${key}-01`,
        drillTo: monthEndOf(key),
        isCurrent: key === today.slice(0, 7),
      });
      cursor = shiftDays(monthEndOf(key), 1);
    }
  } else {
    for (let i = 0; i < range.days; i++) {
      const date = shiftDays(range.from, i);
      trendBars.push({
        label: String(Number(date.slice(8, 10))),
        value: byBucket.get(date) ?? 0,
        drillMonth: null,
        isCurrent: date === today,
      });
    }
  }
  const peakBucket = Math.max(0, ...trendBars.map((b) => b.value));

  // ── Counters needing attention ──────────────────────────────────────────
  const attention = allCounters
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
    // Never-visited first, then longest-since-visit.
    .sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999))
    .slice(0, 12);

  const rangeNote = range.isCurrent ? t("so far") : "";

  const kpis: KpiProps[] = [
    { icon: "box", tint: "#7B2FA0", label: t("Packets sold"), value: packets.toLocaleString("en-IN"), delta: packetsDelta, deltaLabel: t("vs last period") },
    { icon: "route", tint: "#2E9E5A", label: t("Visits"), value: visitCount.toLocaleString("en-IN"), delta: visitsDelta, deltaLabel: t("vs last period") },
    { icon: "store", tint: "#128A82", label: t("Coverage"), value: `${coveragePct}%`, sub: `${covered}/${totalCounters} ${t("counters")}` },
    { icon: "store", tint: "var(--accent)", label: t("New counters today"), value: newCountersToday.toLocaleString("en-IN"), sub: t("added to the network") },
    { icon: "star", tint: "#B9812E", label: t("Avg Deedar rank"), value: avgRank > 0 ? avgRank.toFixed(1) : "—", sub: t("shelf position") },
    { icon: "clock", tint: "#8A6FBF", label: t("Avg visit time"), value: mmss(avgVisitSeconds), sub: t("time on counter") },
    { icon: "rupee", tint: "#4C8C2B", label: t("Scheme payouts"), value: `₹${schemePayout.toLocaleString("en-IN")}`, sub: t("settled via UPI") },
    { icon: "globe", tint: "#2E5FA3", label: t("Network"), value: totalCounters.toLocaleString("en-IN"), sub: `${allCnfs.length} ${t("C&F")} · ${allDepots.length} ${t("depots")}` },
    { icon: "trendUp", tint: "#128A82", label: t("Visits today"), value: visitsToday, sub: `${activeRepsToday}/${fieldReps.length} ${t("reps active")}` },
    { icon: "alert", tint: "#C7263B", label: t("Declining counters"), value: decliningCount, sub: t("flagged for revisit"), tone: "bad" },
  ];

  return (
    <div>
      {/* Header + controls */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">
            {range.label}
            {rangeNote && (
              <span className="ml-2 text-[13px] font-medium" style={{ color: "var(--ink-3)" }}>
                {rangeNote}
              </span>
            )}
          </h1>
          <p className="page-subtitle max-w-2xl">
            {selectedState
              ? `${t("Totals for")} ${selectedState.name}.`
              : t("Company-wide totals for the selected dates.")}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-end gap-2">
          <DateRangePicker from={range.from} to={range.to} minDate={range.minDate} maxDate={range.maxDate} />
          <StatePicker options={allStates} value={selectedState?.id ?? "all"} />
          <RefreshButton />
        </div>
      </div>

      {/* Context strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {formatISTDate(today)}
        </span>
        <span>·</span>
        <span>{selectedState ? selectedState.name : `${allStates.length} ${t("states")}`}</span>
        <span>·</span>
        <span>{allCnfs.length} {t("C&F")}</span>
        <span>·</span>
        <span>{allDepots.length} {t("depots")}</span>
        <span>·</span>
        <span>{totalCounters} {t("counters")}</span>
      </div>

      {/* KPI grid */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} t={t} />
        ))}
      </div>

      {/* Trend + counter health */}
      <div className="mb-5 grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex flex-col p-5">
          <CardHead
            icon="box"
            tint="#7B2FA0"
            title={t("Sales trend")}
            sub={
              grain === "month"
                ? `${t("Packets sold by month")} · ${range.label}`
                : `${t("Packets sold by day")} · ${range.label}`
            }
            right={
              <div className="flex flex-none items-center gap-3">
                <div className="text-right">
                  <div className="text-[18px] font-bold leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                    {peakBucket.toLocaleString("en-IN")}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {grain === "month" ? t("peak month") : t("peak day")}
                  </div>
                </div>
                {!range.isYtd && <BackToYtd label={t("← Back to YTD")} />}
              </div>
            }
          />
          <SalesTrend bars={trendBars} drillable={grain === "month"} />
        </section>

        <DonutCard
          icon="heart"
          tint="var(--success)"
          title={t("Counter health")}
          sub={t("By counter status")}
          segments={statusDonut}
          total={totalCounters}
          centerValue={`${activePct}%`}
          centerLabel={t("active")}
          empty={totalCounters === 0 ? t("No counters yet.") : undefined}
          t={t}
        />
      </div>

      {/* Three donuts */}
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DonutCard
          icon="pieChart"
          tint="#128A82"
          title={t("Product mix")}
          sub={t("Packets sold, by SKU")}
          segments={productDonut}
          total={mixTotal}
          centerValue={mixTotal.toLocaleString("en-IN")}
          centerLabel={t("packets")}
          empty={mixTotal === 0 ? t("No sales in this period.") : undefined}
          t={t}
        />
        <DonutCard
          icon="swords"
          tint="#C7263B"
          title={t("Competitor presence")}
          sub={t("Visits, by competition")}
          segments={competitorDonut}
          total={compTotal}
          centerValue={compTotal === 0 ? "—" : `${contestedPct}%`}
          centerLabel={t("contested")}
          empty={compTotal === 0 ? t("No visits in this period.") : undefined}
          t={t}
        />
        <DonutCard
          icon="store"
          tint="#4C8C2B"
          title={t("Counter type mix")}
          sub={t("Retail counter types")}
          segments={typeDonut}
          total={retailTotal}
          centerValue={retailTotal.toLocaleString("en-IN")}
          centerLabel={t("counters")}
          empty={retailTotal === 0 ? t("No retail counters in scope yet.") : undefined}
          translateLabels
          t={t}
        />
      </div>

      {/* C&F leaderboard + shelf rank */}
      <div className="mb-5 grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex flex-col p-5">
          <CardHead icon="globe" tint="#2E5FA3" title={t("C&F leaderboard")} sub={t("Packets sold this period")} />
          {cnfBoard.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No sales in this period.")}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cnfBoard.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2.5">
                  <span className="w-[130px] truncate text-[13px]" style={{ color: "var(--ink-1)" }}>{c.name}</span>
                  <div className="flex-1">
                    <ProgressBar pct={Math.round((c.packets / cnfMax) * 100)} height={13} color={i === 0 ? "var(--success)" : "var(--accent)"} />
                  </div>
                  <span className="w-24 flex-none text-right text-[12px]" style={{ color: "var(--ink-3)" }}>
                    <b className="tabular-nums" style={{ color: "var(--ink-1)" }}>{c.packets.toLocaleString("en-IN")}</b>
                    {" · "}{c.visits}{" "}{t("visits")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card flex flex-col p-5">
          <CardHead icon="star" tint="#B9812E" title={t("Deedar shelf rank")} sub={t("Visits, by shelf position")} />
          {rankTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No ranked visits in this period.")}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rankBars.map((r) => (
                <div key={r.rank} className="flex items-center gap-2.5">
                  <span className="w-7 flex-none text-[12.5px] font-bold" style={{ color: "var(--ink-1)" }}>#{r.rank}</span>
                  <div className="flex-1">
                    <ProgressBar pct={r.pct} height={12} color={r.rank <= 2 ? "var(--success)" : r.rank === 3 ? "var(--warning)" : "var(--danger)"} />
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

      {/* Depot + rep leaderboards */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <ScrollBoard
          icon="trophy"
          tint="#B9812E"
          title={t("Depot leaderboard")}
          sub={t("Packets sold this period")}
          empty={t("No sales in this period.")}
          rows={depotBoard.map<BoardRow>((d) => ({
            key: d.name,
            name: d.name,
            value: d.packets.toLocaleString("en-IN"),
            pct: Math.round((d.packets / depotMax) * 100),
          }))}
        />
        <section className="card flex flex-col overflow-hidden p-0">
          <div
            className="flex flex-none items-center justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: "var(--hairline-soft)" }}
          >
            <CardHead
              icon="users"
              tint="var(--accent)"
              title={t("Packets sold today by ISR")}
              sub={t("Tap an ISR for that day's detail")}
            />
            {isrBoard.length > 0 && (
              <span
                className="chip flex-none"
                style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}
              >
                {isrBoard.length}
              </span>
            )}
          </div>
          <IsrLeaderboard
            rows={isrBoard}
            rowsVisible={5}
            date={today}
            emptyLabel={t("No ISR activity today.")}
            t={t}
          />
        </section>
      </div>

      {/* Area leaderboard + stock health */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <ScrollBoard
          icon="pin"
          tint="#128A82"
          title={t("Top areas")}
          sub={t("Packets sold this period")}
          empty={t("No area activity in this period.")}
          rows={areaBoard.map<BoardRow>((a) => ({
            key: a.name,
            name: a.name,
            value: a.packets.toLocaleString("en-IN"),
            pct: Math.round((a.packets / areaMax) * 100),
          }))}
        />
        <DonutCard
          icon="box"
          tint="#128A82"
          title={t("Last observed stock")}
          sub={t("Counters by last visit's stock level")}
          segments={stockDonut}
          total={retailTotal}
          centerValue={retailTotal.toLocaleString("en-IN")}
          centerLabel={t("counters")}
          empty={retailTotal === 0 ? t("No retail counters in scope yet.") : undefined}
          translateLabels
          t={t}
        />
      </div>

      {/* State footprint + top brands */}
      <div className="mb-5 grid items-stretch gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-5">
          <CardHead
            icon="globe"
            tint="#2E5FA3"
            title={t("Counters by state")}
            sub={t("Footprint by state — scales as new states onboard")}
          />
          {stateBars.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters yet.")}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {stateBars.map((s) => (
                <div key={s.name} className="flex items-center gap-2.5">
                  <span className="w-[100px] truncate text-[13px]" style={{ color: "var(--ink-1)" }}>{s.name}</span>
                  <div className="flex-1"><ProgressBar pct={s.pct} height={13} /></div>
                  <span className="w-8 flex-none text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card flex flex-col p-5">
          <CardHead icon="swords" tint="#C7263B" title={t("Top competitor brands")} sub={t("Most-seen in this period")} />
          {topBrands.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No competitor brands recorded in this period.")}</p>
          ) : (
            <div className="flex flex-col">
              {topBrands.map((b, i) => (
                <div
                  key={b.brand}
                  className="flex items-center justify-between gap-3 py-2 text-[13px]"
                  style={{ borderBottom: i < topBrands.length - 1 ? "1px solid var(--hairline-soft)" : undefined }}
                >
                  <span className="min-w-0 truncate" style={{ color: "var(--ink-1)" }}>{b.brand}</span>
                  <span className="flex-none font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>
                    {b.n} {t(b.n === 1 ? "sighting" : "sightings")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Counters needing attention */}
      <section className="card mb-5 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline-soft)" }}>
          <CardHead
            icon="alert"
            tint="#C7263B"
            title={t("Counters needing attention")}
            sub={t("Declining, or not visited in 14+ days")}
          />
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
                          background:
                            c.status === "declining" ? "rgba(199,38,59,.1)" : c.status === "dormant" ? "rgba(224,161,0,.12)" : "rgba(30,158,90,.12)",
                          color:
                            c.status === "declining" ? "var(--danger)" : c.status === "dormant" ? "var(--warning)" : "var(--success)",
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

      {/* Depot performance table — deliberately TODAY, not the selected period:
          this is the live ops table; the leaderboards above cover the period. */}
      <h6 className="mb-3" style={cardTitle}>{t("Depot performance comparison")} · {t("today")}</h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Depot", "C&F", "Reps", "Counters", "Visits today", "Packets today", "Avg counter time", "Declining"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depotRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: "var(--ink-3)" }}>{t("No depots yet.")}</td>
              </tr>
            ) : (
              depotRows.map((d) => (
                <tr key={d.name}>
                  <td className="font-semibold">{d.name}</td>
                  <td style={{ color: "var(--ink-3)" }}>{d.cnf}</td>
                  <td>{d.reps}</td>
                  <td>{d.counters}</td>
                  <td>{d.visits}</td>
                  <td>{d.packets}</td>
                  <td className="tabular-nums">{d.avgCounterTime}</td>
                  <td style={{ color: "var(--danger)" }}>{d.declining}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Plain link back to the whole-year view — a server component, so no client
 * JS for what is just a URL change. */
function BackToYtd({ label }: { label: string }) {
  // Clearing from/to lets `resolveRange` fall back to its YTD default, so the
  // link doesn't have to know today's date.
  return (
    <a href="?" className="link text-[12px]">
      {label}
    </a>
  );
}
