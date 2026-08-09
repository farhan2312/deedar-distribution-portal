import { redirect } from "next/navigation";
import { db } from "@/db";
import { cnfs, counters, depots, states, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

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
    { label: "Incentives payable", value: "₹2,960", danger: false },
    { label: "Declining counters", value: decliningCount, danger: true },
  ];

  return (
    <div>
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Kanpur HQ — Company Dashboard
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>
        Company-wide view across every state, C&amp;F HQ, depot and area.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 24 }}>
        {stats.map((s) => (
          <div className="card" style={{ padding: 18 }} key={s.label}>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color: s.danger ? "var(--danger)" : "var(--ink-1)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, alignItems: "stretch" }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <h6 style={cardTitle}>Counter health</h6>
          <p style={cardSub}>Overall company health, by counter status</p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: health.conic, flex: "none", position: "relative" }}>
              <div style={{ position: "absolute", inset: 16, background: "var(--bg)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
                {health.activePct}%
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              <HealthLegend color="var(--success)" label={`Active — ${activeCount}`} />
              <HealthLegend color="var(--warning)" label={`Dormant — ${dormantCount}`} />
              <HealthLegend color="var(--danger)" label={`Declining — ${decliningCount}`} last />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <h6 style={cardTitle}>Counters by state</h6>
          <p style={cardSub}>Footprint by state — scales as new states onboard</p>
          {stateBars.map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 100, fontSize: 13 }}>{s.name}</div>
              <div style={{ flex: 1, background: "var(--bg-soft)", height: 16, borderRadius: "var(--r-pill)" }}>
                <div style={{ height: "100%", width: `${s.pct}%`, background: "var(--accent)", borderRadius: "var(--r-pill)" }} />
              </div>
              <div style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 700 }}>{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      <h6 style={{ ...cardTitle, marginBottom: 12 }}>Depot performance comparison</h6>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {["Depot", "Reps", "Counters", "Visits today", "Packets today", "Avg counter time", "Declining"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {depotRows.map((d) => (
            <tr key={d.name}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{d.name}</td>
              <td style={tdStyle}>{d.reps}</td>
              <td style={tdStyle}>{d.counters}</td>
              <td style={tdStyle}>{d.visits}</td>
              <td style={tdStyle}>{d.packets}</td>
              <td style={tdStyle}>{d.avgCounterTime}h</td>
              <td style={{ ...tdStyle, color: "var(--danger)" }}>{d.declining}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 24, maxWidth: 320 }}>
        <h6 style={{ ...cardTitle, marginBottom: 12 }}>Product mix (MTD)</h6>
        <div className="card" style={{ padding: 16 }}>
          {PRODUCT_MIX.map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, color: "var(--ink-2)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, display: "inline-block" }} />
              {p.label} — {p.pct}%
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", padding: 10, borderBottom: "1px solid var(--hairline)" };
const tdStyle: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" };

function HealthLegend({ color, label, last }: { color: string; label: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: last ? 0 : 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}
