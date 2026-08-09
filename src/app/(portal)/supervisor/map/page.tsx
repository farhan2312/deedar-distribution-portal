import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { STATUS_STYLE, TEAM_REPS, splitPct } from "@/lib/portal/mock";

const STATUS_PIN: Record<string, string> = {
  active: "var(--ink-3)",
  dormant: "var(--ink-3)",
  declining: "#C7263B",
};

// Deterministic scatter across the stylized map from the counter id.
function pinPos(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return { top: 10 + (h % 78), left: 6 + ((h >> 3) % 86) };
}

export default async function SupervisorMapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const depotName = user.supervisedDepots[0]?.name ?? user.depot?.name ?? "your depot";
  const depotIds = user.supervisedDepots.map((d) => d.id);
  if (user.depot) depotIds.push(user.depot.id);

  const counterRows = depotIds.length
    ? await db
        .select({ id: counters.id, name: counters.name, status: counters.status, area: areas.name })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];

  const pins = counterRows.map((c) => ({ ...c, ...pinPos(c.id) }));

  return (
    <div>
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 10px" }}>
        Team today
      </h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginBottom: 24 }}>
        {TEAM_REPS.map((r) => {
          const st = STATUS_STYLE[r.status];
          return (
            <div className="card" style={{ padding: 16 }} key={r.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>{r.name}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-pill)", background: st.bg, color: st.color }}>
                  {st.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                {r.area} · {r.visitsToday}/{r.target} visits · {r.counterTimeHrs}h on counter
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 10, flexWrap: "wrap" }}>
        <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: 0 }}>
          {depotName} — live map
        </h4>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink-2)", alignItems: "center" }}>
          <MapLegend color="var(--success)" label="Visited" />
          <MapLegend color="var(--ink-3)" label="Pending" />
          <MapLegend color="var(--danger)" label="Declining" />
          <MapLegend color="#2E5FA3" label="Salesman" />
        </div>
      </div>

      {/* Stylized street map */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "21 / 9", background: "#EEF3EC", borderRadius: "var(--r-lg)", overflow: "hidden", border: "1px solid var(--hairline-soft)" }}>
        {[
          { top: "6%", left: "4%", w: "26%", h: "24%" },
          { top: "6%", left: "33%", w: "22%", h: "24%" },
          { top: "6%", left: "80%", w: "16%", h: "12%" },
          { top: "44%", left: "4%", w: "30%", h: "22%" },
          { top: "44%", left: "38%", w: "20%", h: "22%" },
          { top: "44%", left: "76%", w: "20%", h: "22%" },
          { top: "80%", left: "4%", w: "30%", h: "14%" },
        ].map((b, i) => (
          <div key={i} style={{ position: "absolute", top: b.top, left: b.left, width: b.w, height: b.h, background: "#E1EBDD", borderRadius: 10 }} />
        ))}
        <div style={{ position: "absolute", top: "32%", left: 0, width: "100%", height: "9%", background: "#F7F3E9" }} />
        <div style={{ position: "absolute", top: "32%", left: "2%", fontSize: 11, letterSpacing: ".08em", color: "#A69B7C", fontWeight: 600 }}>G.T. ROAD</div>
        <div style={{ position: "absolute", top: "70%", left: 0, width: "100%", height: "9%", background: "#F7F3E9" }} />
        <div style={{ position: "absolute", top: "70%", left: "2%", fontSize: 11, letterSpacing: ".08em", color: "#A69B7C", fontWeight: 600 }}>STATION ROAD</div>

        {pins.map((p) => (
          <div key={p.id} title={`${p.name} · ${p.area}`} style={{ position: "absolute", top: `${p.top}%`, left: `${p.left}%`, transform: "translate(-50%,-50%)" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: STATUS_PIN[p.status] ?? "var(--ink-3)", border: "2px solid #fff", boxShadow: "var(--shadow-sm)" }} />
          </div>
        ))}

        {/* Live salesman markers (mock positions) */}
        {[
          { name: "Hukum", top: 22, left: 40 },
          { name: "Sagar", top: 58, left: 66 },
        ].map((s) => (
          <div key={s.name} style={{ position: "absolute", top: `${s.top}%`, left: `${s.left}%`, transform: "translate(-50%,-50%)", zIndex: 20, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2E5FA3", border: "2px solid #fff", boxShadow: "var(--shadow-md)", flex: "none" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#2E5FA3", background: "rgba(255,255,255,.85)", padding: "2px 8px", borderRadius: "var(--r-pill)", whiteSpace: "nowrap" }}>
              {s.name}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
        Every geo-tagged counter is plotted alongside live salesman positions.
        Stylized street map — no satellite imagery.
      </p>

      {/* Live team table */}
      <div className="card" style={{ padding: 18, marginTop: 24 }}>
        <h6 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, margin: "0 0 14px" }}>
          Live team — status for the day
        </h6>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Day split (10 hr)", "Counter hrs"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--hairline)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_REPS.map((r) => {
              const s = splitPct(r);
              const st = STATUS_STYLE[r.status];
              return (
                <tr key={r.name}>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)", fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-pill)", background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" }}>{r.visitsToday}/{r.target}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" }}>
                    <div style={{ display: "flex", height: 8, width: 160, borderRadius: "var(--r-pill)", overflow: "hidden", background: "var(--hairline-soft)" }}>
                      <div style={{ width: `${s.counterPct}%`, background: "var(--accent)" }} />
                      <div style={{ width: `${s.travelPct}%`, background: "#8CB4C9" }} />
                      <div style={{ width: `${s.idlePct}%`, background: "#E0B15C" }} />
                    </div>
                  </td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" }}>{r.counterTimeHrs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapLegend({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color, marginRight: 5 }} />
      {label}
    </span>
  );
}
