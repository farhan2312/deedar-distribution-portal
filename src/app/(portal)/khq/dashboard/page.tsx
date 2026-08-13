import { redirect } from "next/navigation";
import { db } from "@/db";
import { cnfs, counters, depots, states, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { LegendDot } from "@/components/ui/legend-dot";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar } from "@/components/ui/progress-bar";

const PRODUCT_MIX = [
  { label: "DG10", pct: 38, color: "#7B2FA0" },
  { label: "DG20", pct: 27, color: "#4C8C2B" },
  { label: "DB20", pct: 21, color: "#B9812E" },
  { label: "DB40", pct: 14, color: "#128A82" },
];

function healthConic(active: number, dormant: number, declining: number) {
  const total = Math.max(1, active + dormant + declining);
  const a = Math.round((active / total) * 100);
  const d = Math.round((dormant / total) * 100);
  return {
    conic: `conic-gradient(var(--success) 0% ${a}%, var(--warning) ${a}% ${a + d}%, var(--danger) ${a + d}% 100%)`,
    activePct: a,
  };
}

export default async function KhqDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [allStates, allCnfs, allDepots, allCounters, allReps] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db.select({ id: counters.id, status: counters.status, depotId: counters.depotId }).from(counters),
    db.select({ id: users.id, depotId: users.depotId, roles: users.accessRoles }).from(users),
  ]);

  const activeCount = allCounters.filter((c) => c.status === "active").length;
  const dormantCount = allCounters.filter((c) => c.status === "dormant").length;
  const decliningCount = allCounters.filter((c) => c.status === "declining").length;
  const health = healthConic(activeCount, dormantCount, decliningCount);
  const fieldReps = allReps.filter((r) => r.roles.includes("field"));

  // State bars (real counter counts per state via cnf->depot chain)
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

  // Per-depot comparison (real counters/reps + mock activity)
  const depotRows = allDepots.map((d) => {
    const dc = allCounters.filter((c) => c.depotId === d.id);
    const dr = fieldReps.filter((r) => r.depotId === d.id);
    return {
      name: d.name,
      reps: dr.length,
      counters: dc.length,
      visits: dr.length * 23,
      packets: dr.length * 18,
      avgCounterTime: dr.length ? "4.1" : "0.0",
      declining: dc.filter((c) => c.status === "declining").length,
    };
  });

  const stats = [
    { label: "States", value: allStates.length },
    { label: "C&F HQs", value: allCnfs.length },
    { label: "Depots", value: allDepots.length },
    { label: "Counters", value: allCounters.length },
    { label: "Field reps", value: fieldReps.length },
    { label: "Packets sold today", value: 35 },
    { label: "Incentives payable", value: "₹2,960" },
    { label: "Declining counters", value: decliningCount, danger: true },
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} danger={s.danger} />
        ))}
      </div>

      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>Counter health</h6>
          <p style={cardSub}>Overall company health, by counter status</p>
          <div className="flex flex-1 items-center gap-4.5">
            <div className="relative h-24 w-24 flex-none rounded-full" style={{ background: health.conic }}>
              <div
                className="absolute inset-4 flex items-center justify-center rounded-full text-[15px] font-bold"
                style={{ background: "var(--bg)", fontFamily: "var(--font-display)" }}
              >
                {health.activePct}%
              </div>
            </div>
            <div className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              <LegendDot color="var(--success)" label={`Active — ${activeCount}`} square />
              <LegendDot color="var(--warning)" label={`Dormant — ${dormantCount}`} square />
              <LegendDot color="var(--danger)" label={`Declining — ${decliningCount}`} square />
            </div>
          </div>
        </div>

        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>Counters by state</h6>
          <p style={cardSub}>Footprint by state — scales as new states onboard</p>
          {stateBars.map((s) => (
            <div key={s.name} className="mb-2.5 flex items-center gap-2.5">
              <div className="w-[100px] text-[13px]" style={{ color: "var(--ink-1)" }}>{s.name}</div>
              <div className="flex-1"><ProgressBar pct={s.pct} height={16} /></div>
              <div className="w-7 text-right text-[12px] font-bold" style={{ color: "var(--ink-1)" }}>{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      <h6 className="mb-3" style={cardTitle}>Depot performance comparison</h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Depot", "Reps", "Counters", "Visits today", "Packets today", "Avg counter time", "Declining"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depotRows.map((d) => (
              <tr key={d.name}>
                <td className="font-semibold">{d.name}</td>
                <td>{d.reps}</td>
                <td>{d.counters}</td>
                <td>{d.visits}</td>
                <td>{d.packets}</td>
                <td>{d.avgCounterTime}h</td>
                <td style={{ color: "var(--danger)" }}>{d.declining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 max-w-xs">
        <h6 className="mb-3" style={cardTitle}>Product mix (MTD)</h6>
        <div className="card space-y-1.5 p-4">
          {PRODUCT_MIX.map((p) => (
            <LegendDot key={p.label} color={p.color} label={`${p.label} — ${p.pct}%`} square />
          ))}
        </div>
      </div>
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px", color: "var(--ink-1)" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
