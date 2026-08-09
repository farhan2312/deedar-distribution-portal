import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { LegendDot } from "@/components/ui/legend-dot";
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
      <h4 className="mb-2.5 text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Team today
      </h4>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEAM_REPS.map((r) => {
          const st = STATUS_STYLE[r.status];
          return (
            <div className="card p-4" key={r.name}>
              <div className="flex items-center justify-between">
                <div className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{r.name}</div>
                <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                  {st.label}
                </span>
              </div>
              <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {r.area} · {r.visitsToday}/{r.target} visits · {r.counterTimeHrs}h on counter
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-4">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {depotName} — live map
        </h4>
        <div className="flex items-center gap-3.5">
          <LegendDot color="var(--success)" label="Visited" />
          <LegendDot color="var(--ink-3)" label="Pending" />
          <LegendDot color="var(--danger)" label="Declining" />
          <LegendDot color="#2E5FA3" label="Salesman" />
        </div>
      </div>

      {/* Stylized street map */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border"
        style={{ aspectRatio: "21 / 9", background: "#EEF3EC", borderColor: "var(--hairline-soft)", boxShadow: "var(--shadow-sm)" }}
      >
        {[
          { top: "6%", left: "4%", w: "26%", h: "24%" },
          { top: "6%", left: "33%", w: "22%", h: "24%" },
          { top: "6%", left: "80%", w: "16%", h: "12%" },
          { top: "44%", left: "4%", w: "30%", h: "22%" },
          { top: "44%", left: "38%", w: "20%", h: "22%" },
          { top: "44%", left: "76%", w: "20%", h: "22%" },
          { top: "80%", left: "4%", w: "30%", h: "14%" },
        ].map((b, i) => (
          <div key={i} className="absolute rounded-[10px]" style={{ top: b.top, left: b.left, width: b.w, height: b.h, background: "#E1EBDD" }} />
        ))}
        <div className="absolute" style={{ top: "32%", left: 0, width: "100%", height: "9%", background: "#F7F3E9" }} />
        <div className="absolute text-[11px] font-semibold" style={{ top: "32%", left: "2%", letterSpacing: ".08em", color: "#A69B7C" }}>G.T. ROAD</div>
        <div className="absolute" style={{ top: "70%", left: 0, width: "100%", height: "9%", background: "#F7F3E9" }} />
        <div className="absolute text-[11px] font-semibold" style={{ top: "70%", left: "2%", letterSpacing: ".08em", color: "#A69B7C" }}>STATION ROAD</div>

        {pins.map((p) => (
          <div key={p.id} title={`${p.name} · ${p.area}`} className="absolute" style={{ top: `${p.top}%`, left: `${p.left}%`, transform: "translate(-50%,-50%)" }}>
            <div
              className="h-[22px] w-[22px] rounded-full border-2 border-white"
              style={{ background: STATUS_PIN[p.status] ?? "var(--ink-3)", boxShadow: "var(--shadow-sm)" }}
            />
          </div>
        ))}

        {/* Live salesman markers (mock positions) */}
        {[
          { name: "Hukum", top: 22, left: 40 },
          { name: "Sagar", top: 58, left: 66 },
        ].map((s) => (
          <div key={s.name} className="absolute z-20 flex items-center gap-1.5" style={{ top: `${s.top}%`, left: `${s.left}%`, transform: "translate(-50%,-50%)" }}>
            <div className="h-6 w-6 flex-none rounded-full border-2 border-white" style={{ background: "#2E5FA3", boxShadow: "var(--shadow-md)" }} />
            <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ color: "#2E5FA3", background: "rgba(255,255,255,.85)" }}>
              {s.name}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        Every geo-tagged counter is plotted alongside live salesman positions.
        Stylized street map — no satellite imagery.
      </p>

      {/* Live team table */}
      <h6 className="mt-7 mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Live team — status for the day
      </h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Day split (10 hr)", "Counter hrs"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_REPS.map((r) => {
              const s = splitPct(r);
              const st = STATUS_STYLE[r.status];
              return (
                <tr key={r.name}>
                  <td className="font-semibold">{r.name}</td>
                  <td>
                    <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>{st.label}</span>
                  </td>
                  <td>{r.visitsToday}/{r.target}</td>
                  <td>
                    <div className="flex h-2 w-40 overflow-hidden rounded-full" style={{ background: "var(--hairline-soft)" }}>
                      <div style={{ width: `${s.counterPct}%`, background: "var(--accent)" }} />
                      <div style={{ width: `${s.travelPct}%`, background: "#8CB4C9" }} />
                      <div style={{ width: `${s.idlePct}%`, background: "#E0B15C" }} />
                    </div>
                  </td>
                  <td>{r.counterTimeHrs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
