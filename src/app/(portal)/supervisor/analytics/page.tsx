import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { STATUS_STYLE, TEAM_REPS, splitPct } from "@/lib/portal/mock";

const DENSITY_COLORS = ["#1E6B3C", "#7AB88A", "#E0B15C", "#C7263B"];

export default async function SupervisorAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const depotName = user.supervisedDepots[0]?.name ?? user.depot?.name ?? "your depot";
  const depotIds = user.supervisedDepots.map((d) => d.id);
  if (user.depot) depotIds.push(user.depot.id);

  // Real retail density: counters per area in the supervised depots.
  const areaRows = depotIds.length
    ? await db
        .select({ area: areas.name, status: counters.status })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];
  const byArea = new Map<string, number>();
  for (const r of areaRows) byArea.set(r.area, (byArea.get(r.area) ?? 0) + 1);
  const densityTiles = [...byArea.entries()].map(([area, count]) => ({
    area,
    color: DENSITY_COLORS[count >= 4 ? 0 : count >= 2 ? 1 : count >= 1 ? 2 : 3],
  }));

  const totalVisits = TEAM_REPS.reduce((s, r) => s + r.visitsToday, 0);
  const totalCounterHrs = TEAM_REPS.reduce((s, r) => s + r.counterTimeHrs, 0);
  const kpis = [
    { value: String(TEAM_REPS.length), label: "Active reps", trend: "on shift", trendColor: "var(--ink-3)" },
    { value: String(totalVisits), label: "Visits today", trend: "+12% vs avg", trendColor: "var(--success)" },
    { value: `${totalCounterHrs.toFixed(1)}h`, label: "Counter time", trend: "steady", trendColor: "var(--ink-3)" },
    { value: String(areaRows.length), label: "Counters covered", trend: "in depot", trendColor: "var(--ink-3)" },
    { value: `${areaRows.filter((r) => r.status === "declining").length}`, label: "Declining", trend: "needs attention", trendColor: "var(--danger)" },
    { value: "96%", label: "Scheme UPI", trend: "auto-paid", trendColor: "var(--success)" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: 0 }}>
          Analytics — {depotName}
        </h4>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Scoped to your assigned depot/area</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 22 }}>
        {kpis.map((k) => (
          <div className="card" style={{ padding: 16 }} key={k.label}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--accent)" }}>
              {k.value}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{k.label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, color: k.trendColor }}>{k.trend}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, alignItems: "start" }}>
        <div className="card" style={{ padding: 18 }}>
          <h6 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
            Time on counter vs travel vs idle (today)
          </h6>
          {TEAM_REPS.map((r) => {
            const s = splitPct(r);
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.name} style={{ padding: "10px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-1)" }}>{r.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: "var(--r-pill)", background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: "var(--r-pill)", overflow: "hidden", background: "var(--hairline-soft)" }}>
                  <div style={{ width: `${s.counterPct}%`, background: "var(--accent)" }} />
                  <div style={{ width: `${s.travelPct}%`, background: "#8CB4C9" }} />
                  <div style={{ width: `${s.idlePct}%`, background: "#E0B15C" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>
                  {r.visitsToday}/{r.target} visits · {r.counterTimeHrs}h on counter
                </div>
              </div>
            );
          })}
          <Legend />
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h6 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
            Retail density by area (counters)
          </h6>
          {densityTiles.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No counters in scope yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(70px,1fr))", gap: 8, marginBottom: 14 }}>
              {densityTiles.map((t) => (
                <div
                  key={t.area}
                  style={{
                    aspectRatio: "1",
                    borderRadius: "var(--r-sm)",
                    background: t.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    textAlign: "center",
                    padding: 4,
                  }}
                >
                  {t.area}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--ink-2)" }}>
            <LegendDot color="#1E6B3C" label="Hot" />
            <LegendDot color="#7AB88A" label="Active" />
            <LegendDot color="#E0B15C" label="Thin" />
            <LegendDot color="#C7263B" label="Gap" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "var(--ink-2)" }}>
      <LegendDot color="var(--accent)" label="Counter time" square />
      <LegendDot color="#8CB4C9" label="Travel" square />
      <LegendDot color="#E0B15C" label="Idle" square />
    </div>
  );
}

function LegendDot({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span>
      <span
        style={{
          display: "inline-block",
          width: 9,
          height: 9,
          borderRadius: square ? 3 : "50%",
          background: color,
          marginRight: 5,
        }}
      />
      {label}
    </span>
  );
}
