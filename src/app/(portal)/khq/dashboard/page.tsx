import { redirect } from "next/navigation";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { cnfs, counters, dayLogs, depots, states, users, visits, type ProductSegment, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { istDateString, istDayBounds } from "@/lib/date";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getT } from "@/lib/i18n/server";
import { LegendDot } from "@/components/ui/legend-dot";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar } from "@/components/ui/progress-bar";

/** Fixed per-SKU colours for the product-mix card — pulled out so both the
 * legend and the (future) chart pick from the same palette. */
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

function healthConic(active: number, dormant: number, declining: number) {
  const total = Math.max(1, active + dormant + declining);
  const a = Math.round((active / total) * 100);
  const d = Math.round((dormant / total) * 100);
  return {
    conic: `conic-gradient(var(--success) 0% ${a}%, var(--warning) ${a}% ${a + d}%, var(--danger) ${a + d}% 100%)`,
    activePct: a,
  };
}

/** IST calendar month-to-date window `[start, end)` in UTC — for MTD
 * aggregates on `visited_at`. Kept inline (not in `lib/date.ts`) because this
 * is the only page that needs it. */
function istMtdBounds(instant: Date = new Date()): { start: Date; end: Date } {
  const today = istDateString(instant);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const start = new Date(`${firstOfMonth}T00:00:00+05:30`);
  const { end } = istDayBounds(instant); // end of today (exclusive)
  return { start, end };
}

/** "M:SS" from whole seconds (matches the visit form's live timer). */
function mmss(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function KhqDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  const dayBounds = istDayBounds();
  const mtdBounds = istMtdBounds();

  // Every aggregate runs in parallel — a dashboard is the classic place where
  // sequential awaits multiply the round-trip cost.
  const [
    allStates,
    allCnfs,
    allDepots,
    allCounters,
    allReps,
    perDepotToday,
    todayTotals,
    activeRepsRows,
    mtdMix,
  ] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db.select({ id: counters.id, status: counters.status, depotId: counters.depotId }).from(counters),
    db.select({ id: users.id, depotId: users.depotId, roles: users.accessRoles }).from(users),
    // Per-depot activity today: visits count, total packets sold, avg counter
    // time in seconds — one grouped query instead of N per-depot round-trips.
    db
      .select({
        depotId: counters.depotId,
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(and(gte(visits.visitedAt, dayBounds.start), lt(visits.visitedAt, dayBounds.end)))
      .groupBy(counters.depotId),
    // Company-wide totals for today's stat cards — same window as above but
    // ungrouped so the "Packets sold today" tile matches the sum in the
    // depot table exactly.
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
      })
      .from(visits)
      .where(and(gte(visits.visitedAt, dayBounds.start), lt(visits.visitedAt, dayBounds.end))),
    // Field reps who actually clocked in today — a truer "active" number
    // than "field reps in the system".
    db
      .select({ userId: dayLogs.userId })
      .from(dayLogs)
      .where(eq(dayLogs.logDate, istDateString())),
    // Product mix MTD: pull just the items JSONB and aggregate in JS. Simpler
    // and safer than a `jsonb_array_elements` SRF join, which errors on a
    // single non-array row (the schema defaults items to `[]`, but a legacy
    // NULL sneaks through the LATERAL and kills the whole aggregate).
    db
      .select({ items: visits.items })
      .from(visits)
      .where(and(gte(visits.visitedAt, mtdBounds.start), lt(visits.visitedAt, mtdBounds.end))),
  ]);

  // ── Counter health ────────────────────────────────────────────────────
  const activeCount = allCounters.filter((c) => c.status === "active").length;
  const dormantCount = allCounters.filter((c) => c.status === "dormant").length;
  const decliningCount = allCounters.filter((c) => c.status === "declining").length;
  const health = healthConic(activeCount, dormantCount, decliningCount);
  const fieldReps = allReps.filter((r) => r.roles.includes("field"));

  // ── State bars ────────────────────────────────────────────────────────
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

  // ── Per-depot activity today ──────────────────────────────────────────
  const perDepot = new Map(perDepotToday.map((r) => [r.depotId, r]));
  const depotRows = allDepots.map((d) => {
    const dc = allCounters.filter((c) => c.depotId === d.id);
    const dr = fieldReps.filter((r) => r.depotId === d.id);
    const activity = perDepot.get(d.id);
    return {
      name: d.name,
      reps: dr.length,
      counters: dc.length,
      visits: activity?.visits ?? 0,
      packets: activity?.packets ?? 0,
      avgCounterTime: mmss(activity?.avgSeconds ?? 0),
      declining: dc.filter((c) => c.status === "declining").length,
    };
  });

  // ── Top-line totals today ─────────────────────────────────────────────
  const packetsToday = todayTotals[0]?.packets ?? 0;
  const visitsToday = todayTotals[0]?.visits ?? 0;
  const activeRepsToday = new Set(activeRepsRows.map((r) => r.userId)).size;

  // ── Product mix (MTD) ─────────────────────────────────────────────────
  // Rows returned as `{ items: VisitItem[] }`. Sum sold-per-segment across
  // every visit's items array; skip malformed / missing entries defensively.
  const soldBySegment = new Map<string, number>();
  for (const row of mtdMix) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!it || typeof it.segment !== "string") continue;
      const sold = Number(it.sold) || 0;
      soldBySegment.set(it.segment, (soldBySegment.get(it.segment) ?? 0) + sold);
    }
  }
  const mixTotal = [...soldBySegment.values()].reduce((s, n) => s + n, 0);
  const productMix = PRODUCT_SEGMENTS.map((p) => {
    const sold = soldBySegment.get(p.value) ?? 0;
    const pct = mixTotal > 0 ? Math.round((sold / mixTotal) * 100) : 0;
    return { label: p.value, sold, pct, color: SEGMENT_COLOR[p.value] };
  });

  const stats = [
    { label: t("States"), value: allStates.length },
    { label: t("C&F HQs"), value: allCnfs.length },
    { label: t("Depots"), value: allDepots.length },
    { label: t("Counters"), value: allCounters.length },
    { label: t("Field reps"), value: fieldReps.length },
    { label: t("Active reps today"), value: activeRepsToday },
    { label: t("Visits today"), value: visitsToday },
    { label: t("Packets sold today"), value: packetsToday },
    { label: t("Declining counters"), value: decliningCount, danger: true },
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} danger={s.danger} />
        ))}
      </div>

      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Counter health")}</h6>
          <p style={cardSub}>{t("Overall company health, by counter status")}</p>
          <div className="flex flex-1 items-center gap-4.5">
            <div className="relative h-24 w-24 flex-none rounded-full" style={{ background: health.conic }}>
              <div
                className="absolute inset-4 flex items-center justify-center rounded-full text-[15px] font-bold"
                style={{ background: "var(--bg)", fontFamily: "var(--font-display)" }}
              >
                {health.activePct}%
              </div>
            </div>
            {/* flex-wrap + gap: LegendDot is `inline-flex`, so a plain
                `space-y-*` on the parent has no effect — the dots collapse
                against each other. Real gaps in both axes. */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
              <LegendDot color="var(--success)" label={`${t("Active")} — ${activeCount}`} square />
              <LegendDot color="var(--warning)" label={`${t("Dormant")} — ${dormantCount}`} square />
              <LegendDot color="var(--danger)" label={`${t("Declining")} — ${decliningCount}`} square />
            </div>
          </div>
        </div>

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
      </div>

      <h6 className="mb-3" style={cardTitle}>{t("Depot performance comparison")}</h6>
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

      <div className="mt-6 max-w-xs">
        <h6 className="mb-3" style={cardTitle}>{t("Product mix (MTD)")}</h6>
        <div className="card p-4">
          {mixTotal === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {t("No sales this month yet.")}
            </p>
          ) : (
            // See counter-health legend above for why this is flex/gap not
            // `space-y-*`. Column layout so each SKU sits on its own line.
            <div className="flex flex-col gap-2">
              {productMix.map((p) => (
                <LegendDot key={p.label} color={p.color} label={`${p.label} — ${p.pct}% (${p.sold})`} square />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px", color: "var(--ink-1)" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
