import { redirect } from "next/navigation";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
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
import { istDateString, istDayBounds } from "@/lib/date";
import { PRODUCT_SEGMENTS, COMPETITOR_LABEL } from "@/lib/field/products";
import { ALL_COUNTER_TYPES } from "@/lib/field/counter-types";
import { daysInMonth, likeForLikePrevEnd, MONTH_SHORT, resolvePeriod, type PeriodParams } from "@/lib/khq/period";
import { getT } from "@/lib/i18n/server";
import { LegendDot } from "@/components/ui/legend-dot";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Donut, type DonutSegment } from "@/components/ui/donut";
import { PeriodPicker } from "../_components/period-picker";
import { SalesTrend, type TrendBar } from "../_components/sales-trend";

// ── Palettes ───────────────────────────────────────────────────────────────
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};
const TYPE_COLOR: Record<string, string> = {
  Kirana: "#7B2FA0",
  Paan: "#4C8C2B",
  "Tea Stall": "#B9812E",
  Wholesale: "#128A82",
  "Vegetable Shop": "#C7263B",
  Others: "#6B7280",
};
/** Competitor pressure escalates neutral → amber → red. */
const COMPETITOR_COLOR: Record<CompetitorPresence, string> = {
  none: "#8CA0B3",
  local: "var(--warning)",
  national: "var(--danger)",
};

function mmss(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Period-over-period delta. `pct === null` means no prior baseline to divide
 * by — `isNew` distinguishes "0 → something" from "0 → 0". */
function delta(cur: number, prev: number): { pct: number | null; isNew: boolean } {
  if (prev === 0) return { pct: null, isNew: cur > 0 };
  return { pct: Math.round(((cur - prev) / prev) * 100), isNew: false };
}

export default async function KhqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  // Oldest visit decides which years the picker offers — no point listing
  // years that can't contain data.
  const [earliest] = await db
    .select({ y: sql<number | null>`extract(year from min(${visits.visitedAt}) AT TIME ZONE 'Asia/Kolkata')::int` })
    .from(visits);

  const params = await searchParams;
  const period = resolvePeriod(params, earliest?.y ?? null);
  // For the CURRENT period, compare against the same elapsed slice of the
  // previous one — otherwise "day 3 of the month" always looks like a crash.
  const prevEnd = likeForLikePrevEnd(period);

  const day = istDayBounds();
  const today = istDateString();
  const inPeriod = and(gte(visits.visitedAt, period.start), lt(visits.visitedAt, period.end));
  const inPrev = and(gte(visits.visitedAt, period.prevStart), lt(visits.visitedAt, prevEnd));

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
    competitorRows,
    rankRows,
    schemeRow,
    brandRows,
    trendRows,
    activeRepsPeriod,
  ] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db.select({ id: counters.id, status: counters.status, depotId: counters.depotId, type: counters.type }).from(counters),
    db.select({ id: users.id, depotId: users.depotId, roles: users.accessRoles }).from(users),
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
      .where(and(gte(visits.visitedAt, day.start), lt(visits.visitedAt, day.end)))
      .groupBy(counters.depotId),
    // Today's visit count only — the "today" KPI tile pairs it with active
    // reps, and per-depot packets are already covered by `perDepotToday`.
    db
      .select({ visits: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(gte(visits.visitedAt, day.start), lt(visits.visitedAt, day.end))),
    db.select({ userId: dayLogs.userId }).from(dayLogs).where(eq(dayLogs.logDate, today)),
    // Product mix — items JSONB aggregated in JS (a jsonb SRF join errors on
    // any non-array legacy row).
    db.select({ items: visits.items }).from(visits).where(inPeriod),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        covered: sql<number>`count(distinct ${visits.counterId})::int`,
        avgRank: sql<number>`coalesce(avg(${visits.rank}), 0)::float`,
        avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
      })
      .from(visits)
      .where(inPeriod),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
      })
      .from(visits)
      .where(inPrev),
    db
      .select({ depotId: counters.depotId, packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int` })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(inPeriod)
      .groupBy(counters.depotId),
    db
      .select({ competitor: visits.competitor, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(inPeriod)
      .groupBy(visits.competitor),
    db
      .select({ rank: visits.rank, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(inPeriod, sql`${visits.rank} is not null`))
      .groupBy(visits.rank),
    db
      .select({ value: sql<number>`coalesce(sum(${schemeClaims.value}), 0)::int` })
      .from(schemeClaims)
      .where(
        and(
          eq(schemeClaims.status, "paid"),
          gte(schemeClaims.createdAt, period.start),
          lt(schemeClaims.createdAt, period.end),
        ),
      ),
    db
      .select({ brand: visits.competitorBrand, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(
        and(
          inPeriod,
          sql`${visits.competitor} <> 'none'`,
          sql`nullif(trim(${visits.competitorBrand}), '') is not null`,
        ),
      )
      .groupBy(visits.competitorBrand)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    // Trend buckets. Grouped by IST month for a year view, by IST day for a
    // month view — one query either way, shaped by the selected period.
    period.month == null
      ? db
          .select({
            bucket: sql<number>`extract(month from ${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .where(inPeriod)
          .groupBy(sql`extract(month from ${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')`)
      : db
          .select({
            bucket: sql<number>`extract(day from ${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .where(inPeriod)
          .groupBy(sql`extract(day from ${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')`),
    // Distinct reps who logged a visit in the period — denominator-free
    // "who was actually working" for the productivity tile.
    db.select({ n: sql<number>`count(distinct ${visits.userId})::int` }).from(visits).where(inPeriod),
  ]);

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

  // ── Counter type mix ────────────────────────────────────────────────────
  const byType = new Map<string, number>();
  for (const c of allCounters) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  const typeDonut: DonutSegment[] = ALL_COUNTER_TYPES.filter((ty) => (byType.get(ty) ?? 0) > 0).map((ty) => ({
    label: ty,
    value: byType.get(ty) ?? 0,
    color: TYPE_COLOR[ty] ?? "#6B7280",
  }));

  // ── Counters by state ───────────────────────────────────────────────────
  const depotToCnf = new Map(allDepots.map((d) => [d.id, d.cnfId]));
  const cnfToState = new Map(allCnfs.map((c) => [c.id, c.stateId]));
  const stateName = new Map(allStates.map((s) => [s.id, s.name]));
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

  // ── Depot table (today) + leaderboard (period) ──────────────────────────
  const perDepot = new Map(perDepotToday.map((r) => [r.depotId, r]));
  const depotName = new Map(allDepots.map((d) => [d.id, d.name]));
  const depotRows = allDepots.map((d) => {
    const dc = allCounters.filter((c) => c.depotId === d.id);
    const dr = fieldReps.filter((r) => r.depotId === d.id);
    const a = perDepot.get(d.id);
    return {
      name: d.name,
      reps: dr.length,
      counters: dc.length,
      visits: a?.visits ?? 0,
      packets: a?.packets ?? 0,
      avgCounterTime: mmss(a?.avgSeconds ?? 0),
      declining: dc.filter((c) => c.status === "declining").length,
    };
  });
  const leaderboard = periodByDepot
    .map((r) => ({ name: depotName.get(r.depotId) ?? "—", packets: Number(r.packets) || 0 }))
    .filter((r) => r.packets > 0)
    .sort((a, b) => b.packets - a.packets)
    .slice(0, 8);
  const leaderMax = Math.max(1, ...leaderboard.map((r) => r.packets));

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
  const repsWorked = activeRepsPeriod[0]?.n ?? 0;
  const packetsPerRep = repsWorked === 0 ? 0 : Math.round(packets / repsWorked);

  const packetsDelta = delta(packets, prevCore[0]?.packets ?? 0);
  const visitsDelta = delta(visitCount, prevCore[0]?.visits ?? 0);

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
  const byBucket = new Map(trendRows.map((r) => [Number(r.bucket), Number(r.packets) || 0]));
  const curMonth = Number(today.slice(5, 7));
  const curDay = Number(today.slice(8, 10));
  const trendBars: TrendBar[] =
    period.month == null
      ? MONTH_SHORT.map((label, i) => ({
          label,
          value: byBucket.get(i + 1) ?? 0,
          drillMonth: i + 1,
          isCurrent: period.isCurrent && i + 1 === curMonth,
        }))
      : Array.from({ length: daysInMonth(period.year, period.month) }, (_, i) => ({
          label: String(i + 1),
          value: byBucket.get(i + 1) ?? 0,
          drillMonth: null,
          isCurrent: period.isCurrent && i + 1 === curDay,
        }));

  const periodNote = period.isCurrent ? t("so far") : "";

  const stats: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; danger?: boolean }> = [
    { label: t("Packets sold"), value: packets.toLocaleString("en-IN"), sub: <Delta d={packetsDelta} t={t} /> },
    { label: t("Visits"), value: visitCount.toLocaleString("en-IN"), sub: <Delta d={visitsDelta} t={t} /> },
    { label: t("Coverage"), value: `${coveragePct}%`, sub: `${covered}/${totalCounters} ${t("counters")}` },
    { label: t("Packets per rep"), value: packetsPerRep.toLocaleString("en-IN"), sub: `${repsWorked} ${t("reps worked")}` },
    { label: t("Avg Deedar rank"), value: avgRank > 0 ? avgRank.toFixed(1) : "—", sub: t("shelf position") },
    { label: t("Avg visit time"), value: mmss(avgVisitSeconds), sub: t("time on counter") },
    { label: t("Scheme payouts"), value: `₹${schemePayout.toLocaleString("en-IN")}`, sub: t("settled via UPI") },
    { label: t("Counters"), value: totalCounters, sub: `${allDepots.length} ${t("depots")}` },
    { label: t("Visits today"), value: visitsToday, sub: `${activeRepsToday}/${fieldReps.length} ${t("reps active")}` },
    { label: t("Declining counters"), value: decliningCount, sub: t("flagged for revisit"), danger: true },
  ];

  return (
    <div>
      {/* Period header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {period.label}
            {periodNote && (
              <span className="ml-2 text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
                {periodNote}
              </span>
            )}
          </h4>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {period.month == null
              ? t("Company-wide totals for the whole year.")
              : t("Company-wide totals for the selected month.")}
          </p>
        </div>
        <PeriodPicker years={period.years} year={period.year} month={period.month} />
      </div>

      {/* KPI grid */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} danger={s.danger} />
        ))}
      </div>

      {/* Trend + status donut */}
      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card flex flex-col p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h6 style={cardTitle}>{t("Sales trend")}</h6>
              <p style={cardSub}>
                {period.month == null
                  ? `${t("Packets sold by month")} · ${period.year}`
                  : `${t("Packets sold by day")} · ${period.label}`}
              </p>
            </div>
            {period.month != null && (
              <BackToYear year={period.year} label={t("← Back to year")} />
            )}
          </div>
          <SalesTrend bars={trendBars} drillable={period.month == null} year={period.year} />
        </div>

        <DonutCard
          title={t("Counter health")}
          sub={t("By counter status")}
          donut={statusDonut}
          centerValue={`${activePct}%`}
          centerLabel={t("active")}
        />
      </div>

      {/* Three donuts */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DonutCard
          title={t("Product mix")}
          sub={t("Packets sold, by SKU")}
          donut={productDonut}
          centerValue={mixTotal.toLocaleString("en-IN")}
          centerLabel={t("packets")}
          empty={mixTotal === 0 ? t("No sales in this period.") : undefined}
          showValues
        />
        <DonutCard
          title={t("Competitor presence")}
          sub={t("Visits, by competition")}
          donut={competitorDonut}
          centerValue={compTotal === 0 ? "—" : `${Math.round((contested / compTotal) * 100)}%`}
          centerLabel={t("contested")}
          empty={compTotal === 0 ? t("No visits in this period.") : undefined}
        />
        <DonutCard
          title={t("Counter type mix")}
          sub={t("By retail type")}
          donut={typeDonut}
          centerValue={totalCounters.toLocaleString("en-IN")}
          centerLabel={t("counters")}
          empty={totalCounters === 0 ? t("No counters yet.") : undefined}
        />
      </div>

      {/* Leaderboard + rank */}
      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Depot leaderboard")}</h6>
          <p style={cardSub}>{t("Packets sold, top depots")}</p>
          {leaderboard.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No sales in this period.")}</p>
          ) : (
            <div className="mt-1 flex flex-col gap-2.5">
              {leaderboard.map((d) => (
                <div key={d.name} className="flex items-center gap-2.5">
                  <div className="w-[120px] truncate text-[13px]" style={{ color: "var(--ink-1)" }}>{d.name}</div>
                  <div className="flex-1"><ProgressBar pct={Math.round((d.packets / leaderMax) * 100)} height={14} /></div>
                  <div className="w-14 text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>
                    {d.packets.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Deedar shelf rank")}</h6>
          <p style={cardSub}>{t("Visits, by shelf position")}</p>
          {rankTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No ranked visits in this period.")}</p>
          ) : (
            <div className="mt-1 flex flex-col gap-2.5">
              {rankBars.map((r) => (
                <div key={r.rank} className="flex items-center gap-2.5">
                  <div className="w-8 text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>#{r.rank}</div>
                  <div className="flex-1">
                    <ProgressBar pct={r.pct} height={14} color={r.rank <= 2 ? "var(--success)" : r.rank === 3 ? "var(--warning)" : "var(--danger)"} />
                  </div>
                  <div className="w-10 text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>{r.n}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* State footprint + top brands */}
      <div className="mb-6 grid items-stretch gap-4 sm:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Counters by state")}</h6>
          <p style={cardSub}>{t("Footprint by state — scales as new states onboard")}</p>
          {stateBars.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters yet.")}</p>
          ) : (
            stateBars.map((s) => (
              <div key={s.name} className="mb-2.5 flex items-center gap-2.5">
                <div className="w-[100px] text-[13px]" style={{ color: "var(--ink-1)" }}>{s.name}</div>
                <div className="flex-1"><ProgressBar pct={s.pct} height={16} /></div>
                <div className="w-7 text-right text-[12px] font-bold" style={{ color: "var(--ink-1)" }}>{s.count}</div>
              </div>
            ))
          )}
        </div>

        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Top competitor brands")}</h6>
          <p style={cardSub}>{t("Most-seen in this period")}</p>
          {topBrands.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No competitor brands recorded in this period.")}</p>
          ) : (
            <div className="mt-1 flex flex-col">
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
        </div>
      </div>

      {/* Depot performance table — deliberately TODAY, not the selected period:
          this is the live ops table, the leaderboard above covers the period. */}
      <h6 className="mb-3" style={cardTitle}>{t("Depot performance comparison")} · {t("today")}</h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Depot", "Reps", "Counters", "Visits today", "Packets today", "Avg counter time", "Declining"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depotRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--ink-3)" }}>{t("No depots yet.")}</td>
              </tr>
            ) : (
              depotRows.map((d) => (
                <tr key={d.name}>
                  <td className="font-semibold">{d.name}</td>
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
function BackToYear({ year, label }: { year: number; label: string }) {
  return (
    <a href={`?year=${year}`} className="link text-[12px]">
      {label}
    </a>
  );
}

function DonutCard({
  title,
  sub,
  donut,
  centerValue,
  centerLabel,
  empty,
  showValues,
}: {
  title: string;
  sub: string;
  donut: DonutSegment[];
  centerValue: React.ReactNode;
  centerLabel: React.ReactNode;
  empty?: string;
  showValues?: boolean;
}) {
  const total = donut.reduce((s, x) => s + x.value, 0);
  return (
    <div className="card flex flex-col p-5">
      <h6 style={cardTitle}>{title}</h6>
      <p style={cardSub}>{sub}</p>
      {empty ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{empty}</p>
      ) : (
        <div className="flex flex-1 items-center gap-4">
          <Donut segments={donut} centerValue={centerValue} centerLabel={centerLabel} />
          <div className="flex flex-col gap-1.5">
            {donut.map((seg) => {
              const pct = total === 0 ? 0 : Math.round((seg.value / total) * 100);
              return (
                <LegendDot
                  key={seg.label}
                  color={seg.color}
                  label={showValues ? `${seg.label} — ${pct}% (${seg.value})` : `${seg.label} — ${pct}%`}
                  square
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Period-over-period delta caption for a StatCard `sub`. */
function Delta({ d, t }: { d: { pct: number | null; isNew: boolean }; t: (k: string) => string }) {
  if (d.pct === null) {
    return <span style={{ color: "var(--ink-3)" }}>{d.isNew ? t("new vs last period") : t("no prior data")}</span>;
  }
  const up = d.pct >= 0;
  return (
    <span style={{ color: up ? "var(--success)" : "var(--danger)" }}>
      {up ? "▲" : "▼"} {Math.abs(d.pct)}% {t("vs last period")}
    </span>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px", color: "var(--ink-1)" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
