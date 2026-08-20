import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, visits, type ProductSegment, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, istDayBounds, istDateString } from "@/lib/date";
import {
  getCountersVisitedToday,
  getLatestVisitStock,
  getScopeDepots,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  pickDepot,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getT } from "@/lib/i18n/server";
import { LegendDot } from "@/components/ui/legend-dot";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Donut, type DonutSegment } from "@/components/ui/donut";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";
import { DayPicker } from "../_components/day-picker";
import { RefreshButton } from "../_components/refresh-button";
import { AreaLeaderboard } from "../_components/area-leaderboard";
import { VisitTrend, type TrendPoint } from "../_components/visit-trend";

/** Which stock band (Out / Low / Mid / High) a raw packet count falls into.
 * `-1` sentinel band ("Not yet visited") is skipped — that case is handled
 * by the caller before this function ever runs. */
function bandForStock(n: number): string {
  if (n <= 0) return "Out of stock";
  if (n <= 10) return "Low (1–10)";
  if (n <= 50) return "Mid (11–50)";
  return "High (51+)";
}

/** Retail-density colour thresholds by counters-per-area (matches the legend). */
function densityColor(count: number): string {
  if (count >= 30) return "#1E6B3C";
  if (count >= 15) return "#7AB88A";
  if (count >= 5) return "#E0B15C";
  return "#C7263B";
}

/** Fixed per-SKU colours — same palette as the Kanpur HQ dashboard's product
 * mix donut, so a segment reads as the same colour everywhere in the app. */
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

/** Fixed per-counter-type colours — same palette as the KHQ dashboard so a
 * type reads the same colour on both pages. Wholesale is intentionally NOT
 * listed here; retail-only breakdown is what the SO cares about. */
const TYPE_COLOR: Record<string, string> = {
  Kirana: "#7B2FA0",
  Paan: "#4C8C2B",
  "Tea Stall": "#B9812E",
  "Vegetable Shop": "#C7263B",
  Others: "#6B7280",
};

/** Retail counter types (Wholesale deliberately excluded — those are handled
 * on the Depot portal, not here). Custom-typed counters (`type === "Others"`
 * with a `typeOther` label) all roll up into the "Others" slice. */
const RETAIL_TYPES = ["Kirana", "Paan", "Tea Stall", "Vegetable Shop", "Others"] as const;

/** Stock-band spec for the "last observed stock" donut. `max === null` means
 * the top band is open-ended. Ordering here is the legend order. */
const STOCK_BANDS: Array<{ label: string; max: number | null; color: string }> = [
  { label: "Out of stock", max: 0, color: "#C7263B" },
  { label: "Low (1–10)", max: 10, color: "#E0A100" },
  { label: "Mid (11–50)", max: 50, color: "#4C8C2B" },
  { label: "High (51+)", max: null, color: "#128A82" },
  { label: "Not yet visited", max: -1, color: "#8A8F98" }, // sentinel — never matches numerically
];

const TREND_DAYS = 7;
/** Rep rows visible before the list scrolls (each row ≈ 74px + border). */
const REP_ROWS_VISIBLE = 5;

function delta(cur: number, prev: number): { pct: number | null; isNew: boolean } {
  if (prev === 0) return { pct: null, isNew: cur > 0 };
  return { pct: Math.round(((cur - prev) / prev) * 100), isNew: false };
}

/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

/** Accept only `YYYY-MM-DD`; anything else falls back to today. */
function normalizeDate(s: string | undefined, fallback: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  return s > fallback ? fallback : s; // never allow a future day
}

/** Midday UTC anchor for an IST date string — safe to add/subtract days from
 * without an off-by-one at the timezone edge. */
function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

function shiftDays(dateStr: string, days: number): string {
  return istDateString(new Date(anchor(dateStr).getTime() + days * 24 * 60 * 60 * 1000));
}

/** "Aug 6" style short label for the trend x-axis. */
function shortDayLabel(dateStr: string): string {
  return anchor(dateStr).toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  });
}

export default async function SupervisorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("Analytics")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const { depot: requestedDepot, date: requestedDate } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);
  const depotIds = depot ? [depot.id] : depots.map((d) => d.id);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);

  // ── Selected day (defaults to today) and its comparison day ─────────────
  const now = nowInstant();
  const todayStr = istDateString(now);
  const dayStr = normalizeDate(requestedDate, todayStr);
  const isToday = dayStr === todayStr;
  const bounds = istDayBounds(anchor(dayStr));
  const prevStr = shiftDays(dayStr, -1);
  const prevBounds = istDayBounds(anchor(prevStr));
  const weekStart = new Date(bounds.end.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000);

  const [
    dayLogs,
    visitMap,
    covered,
    areaRows,
    prevVisitMap,
    prevCovered,
    prevDayLogs,
    visitsPerArea,
    trendRows,
    dayItemsRows,
    counterCatalog,
  ] = await Promise.all([
    getTeamDayLogs(repIds, dayStr),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    depotIds.length
      ? db
          .select({ area: areas.name, status: counters.status })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.depotId, depotIds))
      : Promise.resolve([] as Array<{ area: string; status: "active" | "dormant" | "declining" }>),
    getVisitsToday(repIds, prevBounds),
    getCountersVisitedToday(repIds, prevBounds),
    getTeamDayLogs(repIds, prevStr),
    repIds.length && depotIds.length
      ? db
          .select({ area: areas.name, n: sql<number>`count(*)::int` })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)))
          .groupBy(areas.name)
      : Promise.resolve([] as Array<{ area: string; n: number }>),
    // Trend window (7 days ending on the selected day): visits AND packets
    // sold per day, in one grouped query rather than two round-trips.
    repIds.length
      ? db
          .select({
            d: sql<string>`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
            n: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .where(and(inArray(visits.userId, repIds), gte(visits.visitedAt, weekStart), lt(visits.visitedAt, bounds.end)))
          .groupBy(sql`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date`)
      : Promise.resolve([] as Array<{ d: string; n: number; packets: number }>),
    // Per-SKU breakdown for the SELECTED DAY only (not the 7-day window) —
    // items is a JSONB array, aggregated in JS same as the KHQ dashboard.
    repIds.length
      ? db
          .select({ items: visits.items })
          .from(visits)
          .where(and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)))
      : Promise.resolve([] as Array<{ items: VisitItem[] }>),
    // Counter catalog for the type + last-visit-stock donuts. Retail-only —
    // Wholesale is deliberately dropped in SQL so we don't pull rows we'd
    // throw away in JS.
    depotIds.length
      ? db
          .select({ id: counters.id, type: counters.type })
          .from(counters)
          .where(and(inArray(counters.depotId, depotIds), sql`${counters.type} <> 'Wholesale'`))
      : Promise.resolve([] as Array<{ id: string; type: string }>),
  ]);

  // ── Roster status ───────────────────────────────────────────────────────
  const activeReps = repIds.filter((id) => dayLogs.get(id)?.startAt).length;
  const completedReps = repIds.filter((id) => {
    const l = dayLogs.get(id);
    return l?.startAt && l.endAt;
  }).length;
  const runningReps = repIds.filter((id) => {
    const l = dayLogs.get(id);
    return l?.startAt && !l.endAt;
  }).length;
  const notStartedReps = repIds.length - completedReps - runningReps;

  const totalVisits = [...visitMap.values()].reduce((s, v) => s + v.count, 0);
  const prevVisits = [...prevVisitMap.values()].reduce((s, v) => s + v.count, 0);
  const prevActive = repIds.filter((id) => prevDayLogs.get(id)?.startAt).length;

  const visitsDelta = delta(totalVisits, prevVisits);
  const coveredDelta = delta(covered.size, prevCovered.size);
  const activeDelta = delta(activeReps, prevActive);
  const declining = areaRows.filter((r) => r.status === "declining").length;

  // ── Retail density ──────────────────────────────────────────────────────
  const byArea = new Map<string, number>();
  for (const r of areaRows) byArea.set(r.area, (byArea.get(r.area) ?? 0) + 1);
  const densityTiles = [...byArea.entries()]
    .map(([area, count]) => ({ area, count, color: densityColor(count) }))
    .sort((a, b) => b.count - a.count);

  // ── Areas by visits — EVERY area in scope, not just the ones with a visit
  // today. Unvisited areas show 0 rather than being dropped, so the SO sees
  // the whole depot, not just the winners. ───────────────────────────────
  const visitsByArea = new Map(visitsPerArea.map((r) => [r.area, Number(r.n) || 0]));
  const allAreaNames = [...new Set(areaRows.map((r) => r.area))];
  const areaLeaderboard = allAreaNames
    .map((area) => ({ area, n: visitsByArea.get(area) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.area.localeCompare(b.area));

  // ── Trends (7 days ending on the selected day) ──────────────────────────
  const visitsByDay = new Map(trendRows.map((r) => [r.d, Number(r.n) || 0]));
  const packetsByDay = new Map(trendRows.map((r) => [r.d, Number(r.packets) || 0]));
  const trendDates = Array.from({ length: TREND_DAYS }, (_, i) => shiftDays(dayStr, -(TREND_DAYS - 1 - i)));
  const trendPoints: TrendPoint[] = trendDates.map((d) => ({ label: shortDayLabel(d), value: visitsByDay.get(d) ?? 0 }));
  const packetTrendPoints: TrendPoint[] = trendDates.map((d) => ({ label: shortDayLabel(d), value: packetsByDay.get(d) ?? 0 }));
  const trendHasData = trendPoints.some((p) => p.value > 0);
  const packetTrendHasData = packetTrendPoints.some((p) => p.value > 0);

  // ── Counters by type (retail, Wholesale excluded) ──────────────────────
  // Retail counter types roll up into the five fixed buckets; a custom
  // `typeOther` label lands in "Others".
  const typeCount = new Map<string, number>();
  for (const c of counterCatalog) {
    const key = RETAIL_TYPES.includes(c.type as (typeof RETAIL_TYPES)[number]) ? c.type : "Others";
    typeCount.set(key, (typeCount.get(key) ?? 0) + 1);
  }
  const typeDonut: DonutSegment[] = RETAIL_TYPES.filter((ty) => (typeCount.get(ty) ?? 0) > 0).map((ty) => ({
    label: ty,
    value: typeCount.get(ty) ?? 0,
    color: TYPE_COLOR[ty] ?? "#6B7280",
  }));
  const typeTotal = counterCatalog.length;

  // ── Counters by last observed stock ────────────────────────────────────
  // Needs a follow-up query since the counter ids only exist after the first
  // pass. Cheap — one indexed lookup on visits.counter_id.
  const stockByCounter = await getLatestVisitStock(counterCatalog.map((c) => c.id));
  const bandCount = new Map<string, number>();
  for (const c of counterCatalog) {
    const stock = stockByCounter.get(c.id);
    const key = stock == null ? "Not yet visited" : bandForStock(stock);
    bandCount.set(key, (bandCount.get(key) ?? 0) + 1);
  }
  const stockDonut: DonutSegment[] = STOCK_BANDS.filter((b) => (bandCount.get(b.label) ?? 0) > 0).map((b) => ({
    label: b.label,
    value: bandCount.get(b.label) ?? 0,
    color: b.color,
  }));
  const stockTotal = counterCatalog.length;

  // ── Product mix (selected day) ───────────────────────────────────────────
  const soldBySegment = new Map<string, number>();
  for (const row of dayItemsRows) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!it || typeof it.segment !== "string") continue;
      soldBySegment.set(it.segment, (soldBySegment.get(it.segment) ?? 0) + (Number(it.sold) || 0));
    }
  }
  const packetsTotal = [...soldBySegment.values()].reduce((s, n) => s + n, 0);
  const productDonut: DonutSegment[] = PRODUCT_SEGMENTS.filter((p) => (soldBySegment.get(p.value) ?? 0) > 0).map((p) => ({
    label: p.value,
    value: soldBySegment.get(p.value) ?? 0,
    color: SEGMENT_COLOR[p.value],
  }));

  // ── Rep leaderboard ─────────────────────────────────────────────────────
  const repRows = reps
    .map((r) => {
      const v = visitMap.get(r.id);
      const log = dayLogs.get(r.id);
      return {
        id: r.id,
        name: r.name,
        visits: v?.count ?? 0,
        counters: v?.counters ?? 0,
        started: !!log?.startAt,
        onJob: log?.startAt ? durationLabel(log.startAt, log.endAt ?? now) : null,
      };
    })
    .sort((a, b) => b.visits - a.visits);
  const repMax = Math.max(1, ...repRows.map((r) => r.visits));

  const statusDonut: DonutSegment[] = [
    { label: t("Completed"), value: completedReps, color: "var(--success)" },
    { label: t("Active"), value: runningReps, color: "var(--warning)" },
    { label: t("Not started"), value: notStartedReps, color: "var(--ink-3)" },
  ];

  // ── Highlights ──────────────────────────────────────────────────────────
  type Highlight = { tone: "good" | "warn" | "bad"; icon: IconName; text: string };
  const highlights: Highlight[] = [];
  if (visitsDelta.pct !== null && visitsDelta.pct > 0) {
    highlights.push({ tone: "good", icon: "trendUp", text: `${t("Team is")} ${visitsDelta.pct}% ${t("ahead of the day before.")}` });
  } else if (visitsDelta.pct !== null && visitsDelta.pct < 0) {
    highlights.push({ tone: "warn", icon: "trendDown", text: `${t("Team is")} ${Math.abs(visitsDelta.pct)}% ${t("behind the day before.")}` });
  }
  if (runningReps > 0 && isToday) {
    highlights.push({ tone: "warn", icon: "clock", text: `${runningReps} ${t(runningReps === 1 ? "rep hasn't clocked out yet." : "reps haven't clocked out yet.")}` });
  }
  if (notStartedReps > 0) {
    highlights.push({ tone: "warn", icon: "userOff", text: `${notStartedReps} ${t(notStartedReps === 1 ? "rep didn't start this day." : "reps didn't start this day.")}` });
  }
  if (declining > 0) {
    highlights.push({ tone: "bad", icon: "alert", text: `${declining} ${t(declining === 1 ? "counter is declining — flag for revisit." : "counters are declining — flag for revisit.")}` });
  }
  if (highlights.length === 0) {
    highlights.push({ tone: "good", icon: "check", text: t("All good — nothing needs attention right now.") });
  }

  const scopeLabel = depot?.name ?? (depots.length > 1 ? t("All depots") : depots[0]?.name ?? t("Your depot"));

  const kpis: KpiProps[] = [
    { icon: "users", tint: "var(--accent)", label: t("Active reps"), value: `${activeReps}/${reps.length}`, sub: t("clocked in"), delta: activeDelta },
    { icon: "route", tint: "#2E9E5A", label: isToday ? t("Visits today") : t("Visits"), value: String(totalVisits), sub: t("Team total"), delta: visitsDelta },
    { icon: "store", tint: "#7B2FA0", label: t("Counters covered"), value: String(covered.size), sub: t("Distinct"), delta: coveredDelta },
    { icon: "grid", tint: "#128A82", label: t("Counters in scope"), value: String(areaRows.length), sub: t("in your depots") },
    { icon: "clock", tint: "#B9812E", label: t("Open days"), value: String(runningReps), sub: runningReps ? t("not clocked out") : t("all closed"), tone: runningReps ? "warn" : undefined },
    { icon: "alert", tint: "#C7263B", label: t("Declining"), value: String(declining), sub: t("needs attention"), tone: "bad" },
  ];

  return (
    <div>
      {/* Header + controls */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{t("Analytics Overview")}</h1>
          <p className="page-subtitle max-w-2xl">
            {t("Track your team's performance and visits across your depots.")}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <DayPicker value={dayStr} max={todayStr} />
          <RefreshButton />
          {depots.length > 1 && <DepotPicker options={depots} value={depot?.id ?? "all"} />}
        </div>
      </div>

      {/* Context strip — what you're looking at */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {isToday ? t("Today") : formatISTDate(dayStr)}
        </span>
        <span>·</span>
        <span>{scopeLabel}</span>
        <span>·</span>
        <span>{reps.length} {t("reps")}</span>
      </div>

      {/* KPI grid */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} t={t} />
        ))}
      </div>

      {/* Main grid: rep leaderboard + density */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Rep leaderboard — scrolls after 5 rows */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex flex-none items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline-soft)" }}>
            <div className="flex items-center gap-3">
              <IconTile name="users" tint="var(--accent)" />
              <div>
                <h6 style={cardTitle}>{isToday ? t("Visits today by rep") : t("Visits by rep")}</h6>
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {totalVisits} {t("visits")} · {covered.size} {t("counters")}
                </p>
              </div>
            </div>
            {repRows.length > REP_ROWS_VISIBLE && (
              <span className="chip flex-none" style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}>
                {repRows.length}
              </span>
            )}
          </div>

          {repRows.length === 0 ? (
            <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No reps report to you yet.")}</p>
          ) : (
            // Fixed max-height ≈ 5 rows, then scrolls internally.
            <div className="overflow-y-auto" style={{ maxHeight: REP_ROWS_VISIBLE * 76 }}>
              {repRows.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-5 py-3"
                  style={{ borderBottom: i < repRows.length - 1 ? "1px solid var(--hairline-soft)" : undefined }}
                >
                  <RankBadge rank={i + 1} name={r.name} active={r.visits > 0} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
                        {r.name}
                      </span>
                      <span className="flex-none text-[12.5px] font-bold tabular-nums" style={{ color: r.visits > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
                        {r.visits} <span className="font-medium" style={{ color: "var(--ink-3)" }}>{t("visits")}</span>
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar
                        pct={Math.round((r.visits / repMax) * 100)}
                        height={7}
                        color={i === 0 && r.visits > 0 ? "var(--success)" : "var(--accent)"}
                      />
                    </div>
                    <div className="mt-1.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                      {r.counters} {t("counters covered")}
                      {" · "}
                      {r.started ? `${r.onJob} ${t("on job")}` : t("Not started")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Retail density */}
        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="grid" tint="#128A82" />
            <div>
              <h6 style={cardTitle}>{t("Retail density by area")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Counters per area")}</p>
            </div>
          </div>
          {densityTiles.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters in scope yet.")}</p>
          ) : (
            <div className="mb-3.5 grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2">
              {densityTiles.map((tile) => (
                <div
                  key={tile.area}
                  className="flex aspect-square flex-col items-center justify-center rounded-xl p-1.5 text-center text-white transition-transform hover:scale-[1.04]"
                  style={{ background: tile.color, boxShadow: "var(--shadow-sm)" }}
                  title={`${tile.area} — ${tile.count}`}
                >
                  <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight">{tile.area}</span>
                  <span className="mt-0.5 text-[16px] font-bold leading-none" style={{ fontFamily: "var(--font-display)" }}>
                    {tile.count}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex flex-wrap gap-2.5">
            <LegendDot color="#1E6B3C" label={`${t("Hot")} (30+)`} />
            <LegendDot color="#7AB88A" label={`${t("Active")} (15–30)`} />
            <LegendDot color="#E0B15C" label={`${t("Thin")} (5–15)`} />
            <LegendDot color="#C7263B" label={`${t("Gap")} (<5)`} />
          </div>
        </section>
      </div>

      {/* Trend (wide) + status donut */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex flex-col p-5">
          <div className="mb-2 flex items-center gap-3">
            <IconTile name="trendUp" tint="#2E9E5A" />
            <div>
              <h6 style={cardTitle}>{t("Visit trend")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Team visits, last 7 days")}</p>
            </div>
          </div>
          {!trendHasData ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No visits in the last 7 days.")}</p>
          ) : (
            <VisitTrend points={trendPoints} unitLabel={t("visits")} />
          )}
        </section>

        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="check" tint="var(--accent)" />
            <div>
              <h6 style={cardTitle}>{t("Team status")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("By clock-in state")}</p>
            </div>
          </div>
          {reps.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No reps report to you yet.")}</p>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-5">
              <Donut segments={statusDonut} size={124} centerValue={reps.length} centerLabel={t("reps")} />
              <div className="flex flex-col gap-2">
                <StatusRow color="var(--success)" label={t("Completed")} n={completedReps} total={reps.length} />
                <StatusRow color="var(--warning)" label={t("Active")} n={runningReps} total={reps.length} />
                <StatusRow color="var(--ink-3)" label={t("Not started")} n={notStartedReps} total={reps.length} />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Packets trend (wide) + product mix donut */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex flex-col p-5">
          <div className="mb-2 flex items-center gap-3">
            <IconTile name="box" tint="#7B2FA0" />
            <div>
              <h6 style={cardTitle}>{t("Packets sold trend")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Team packets sold, last 7 days")}</p>
            </div>
          </div>
          {!packetTrendHasData ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No packets sold in the last 7 days.")}</p>
          ) : (
            <VisitTrend points={packetTrendPoints} unitLabel={t("packets")} color="#7B2FA0" />
          )}
        </section>

        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="pieChart" tint="#128A82" />
            <div>
              <h6 style={cardTitle}>{t("Product mix")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{isToday ? t("Packets sold today, by SKU") : t("Packets sold this day, by SKU")}</p>
            </div>
          </div>
          {packetsTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No sales this day yet.")}</p>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-5">
              <Donut segments={productDonut} size={124} centerValue={packetsTotal} centerLabel={t("packets")} />
              <div className="flex flex-col gap-2">
                {productDonut.map((seg) => (
                  <StatusRow key={seg.label} color={seg.color} label={seg.label} n={seg.value} total={packetsTotal} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Counter type mix + Last-observed stock */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="store" tint="#7B2FA0" />
            <div>
              <h6 style={cardTitle}>{t("Counters by type")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Retail counter types")}</p>
            </div>
          </div>
          {typeTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No retail counters in scope yet.")}</p>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-5">
              <Donut segments={typeDonut} size={124} centerValue={typeTotal} centerLabel={t("counters")} />
              <div className="flex flex-col gap-2">
                {typeDonut.map((seg) => (
                  <StatusRow key={seg.label} color={seg.color} label={t(seg.label)} n={seg.value} total={typeTotal} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="box" tint="#128A82" />
            <div>
              <h6 style={cardTitle}>{t("Last observed stock")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Counters by last visit's stock level")}</p>
            </div>
          </div>
          {stockTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No retail counters in scope yet.")}</p>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-5">
              <Donut segments={stockDonut} size={124} centerValue={stockTotal} centerLabel={t("counters")} />
              <div className="flex flex-col gap-2">
                {stockDonut.map((seg) => (
                  <StatusRow key={seg.label} color={seg.color} label={t(seg.label)} n={seg.value} total={stockTotal} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Top areas + highlights */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="trophy" tint="#B9812E" />
            <div>
              <h6 style={cardTitle}>{t("Top performing areas")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{isToday ? t("Visits today, by area") : t("Visits this day, by area")}</p>
            </div>
          </div>
          {areaLeaderboard.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No areas in scope yet.")}</p>
          ) : (
            <AreaLeaderboard rows={areaLeaderboard} />
          )}
        </section>

        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="alert" tint="#C7263B" />
            <div>
              <h6 style={cardTitle}>{t("Highlights")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("What needs your attention")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {highlights.map((h, i) => {
              const c = h.tone === "good" ? "var(--success)" : h.tone === "warn" ? "var(--warning)" : "var(--danger)";
              const bg = h.tone === "good" ? "rgba(30,158,90,.08)" : h.tone === "warn" ? "rgba(224,161,0,.1)" : "rgba(199,38,59,.08)";
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: bg }}>
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full"
                    style={{ background: c, color: "#fff" }}
                  >
                    <Icon name={h.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--ink-1)" }}>{h.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Presentational pieces ──────────────────────────────────────────────────

type KpiProps = {
  icon: IconName;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "bad";
  delta?: { pct: number | null; isNew: boolean };
};

/** KPI tile: tinted icon square, label, big number, then either a delta pill
 * or a plain caption. */
function Kpi({ icon, tint, label, value, sub, tone, delta: d, t }: KpiProps & { t: (k: string) => string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2.5">
        <IconTile name={icon} tint={tint} size={32} />
        <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>{label}</span>
      </div>
      <div className="mt-2.5 text-[26px] font-bold leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {value}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{sub}</div>
      {d && (
        <div className="mt-2">
          <DeltaPill d={d} t={t} />
        </div>
      )}
      {!d && tone && (
        <div className="mt-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              background: tone === "warn" ? "rgba(224,161,0,.14)" : "rgba(199,38,59,.1)",
              color: tone === "warn" ? "var(--warning)" : "var(--danger)",
            }}
          >
            {tone === "warn" ? "!" : "▲"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Green/red "▲ 12%" pill with a muted caption, like the reference. */
function DeltaPill({ d, t }: { d: { pct: number | null; isNew: boolean }; t: (k: string) => string }) {
  if (d.pct === null) {
    return (
      <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        — {d.isNew ? t("new") : t("no change")}
      </span>
    );
  }
  const up = d.pct >= 0;
  const color = up ? "var(--success)" : "var(--danger)";
  const bg = up ? "rgba(30,158,90,.12)" : "rgba(199,38,59,.1)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: bg, color }}>
        {up ? "▲" : "▼"} {Math.abs(d.pct)}%
      </span>
      <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>{t("vs prev day")}</span>
    </span>
  );
}

/** Avatar-style rank badge: initials, with a medal ring for the top 3. */
function RankBadge({ rank, name, active }: { rank: number; name: string; active: boolean }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  const medal = rank === 1 ? "#D4A017" : rank === 2 ? "#9BA3AE" : rank === 3 ? "#B0713A" : null;
  return (
    <span className="relative flex-none">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full text-[12.5px] font-bold"
        style={{
          background: active ? "var(--accent-tint)" : "var(--bg-soft)",
          color: active ? "var(--accent)" : "var(--ink-3)",
          border: medal ? `2px solid ${medal}` : "2px solid transparent",
        }}
      >
        {initials}
      </span>
      {medal && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: medal, border: "1.5px solid var(--surface)" }}
        >
          {rank}
        </span>
      )}
    </span>
  );
}

function StatusRow({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>{label}</span>
      <span className="flex-none font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>{n}</span>
      <span className="w-9 flex-none text-right tabular-nums" style={{ color: "var(--ink-3)" }}>{pct}%</span>
    </div>
  );
}

/** Rounded tinted square holding an icon — the card-header motif. */
function IconTile({ name, tint, size = 36 }: { name: IconName; tint: string; size?: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-xl"
      style={{ height: size, width: size, background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
    >
      <Icon name={name} className={size >= 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
type IconName = "users" | "route" | "store" | "grid" | "clock" | "alert" | "check" | "trendUp" | "trendDown" | "trophy" | "userOff" | "box" | "pieChart";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", ...stroke };
  switch (name) {
    case "users":
      return (
        <svg {...p}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "route":
      return (
        <svg {...p}>
          <circle cx="6" cy="19" r="3" />
          <circle cx="18" cy="5" r="3" />
          <path d="M9 19h5a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5" />
        </svg>
      );
    case "store":
      return (
        <svg {...p}>
          <path d="M3 9V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4M3 9h18M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
          <path d="M9 13h6" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "alert":
      return (
        <svg {...p}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "trendUp":
      return (
        <svg {...p}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      );
    case "trendDown":
      return (
        <svg {...p}>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M17 17h4v-4" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M8 21h8M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
        </svg>
      );
    case "userOff":
      return (
        <svg {...p}>
          <path d="M18 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10.5" cy="7" r="4" />
          <path d="m17 3 5 5M22 3l-5 5" />
        </svg>
      );
    case "box":
      return (
        <svg {...p}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "pieChart":
      return (
        <svg {...p}>
          <path d="M21.2 15.3A10 10 0 1 1 8.7 2.8" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
  }
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: 0, color: "var(--ink-1)" };
