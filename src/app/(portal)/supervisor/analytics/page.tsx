import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { LegendDot } from "@/components/ui/legend-dot";
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
      <div className="mb-5 flex items-baseline justify-between">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Analytics — {depotName}
        </h4>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>Scoped to your assigned depot/area</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div className="card p-4" key={k.label}>
            <div className="text-[24px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
              {k.value}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--ink-2)" }}>{k.label}</div>
            <div className="mt-1.5 text-[11px] font-semibold" style={{ color: k.trendColor }}>{k.trend}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5">
          <h6 className="mb-3.5 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Time on counter vs travel vs idle (today)
          </h6>
          {TEAM_REPS.map((r) => {
            const s = splitPct(r);
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.name} className="py-2.5" style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>{r.name}</div>
                  <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                    {st.label}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "var(--hairline-soft)" }}>
                  <div style={{ width: `${s.counterPct}%`, background: "var(--accent)" }} />
                  <div style={{ width: `${s.travelPct}%`, background: "#8CB4C9" }} />
                  <div style={{ width: `${s.idlePct}%`, background: "#E0B15C" }} />
                </div>
                <div className="mt-1.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {r.visitsToday}/{r.target} visits · {r.counterTimeHrs}h on counter
                </div>
              </div>
            );
          })}
          <div className="mt-3 flex gap-4">
            <LegendDot color="var(--accent)" label="Counter time" square />
            <LegendDot color="#8CB4C9" label="Travel" square />
            <LegendDot color="#E0B15C" label="Idle" square />
          </div>
        </div>

        <div className="card p-5">
          <h6 className="mb-3.5 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Retail density by area (counters)
          </h6>
          {densityTiles.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No counters in scope yet.</p>
          ) : (
            <div className="mb-3.5 grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-2">
              {densityTiles.map((t) => (
                <div
                  key={t.area}
                  className="flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[11px] font-semibold text-white"
                  style={{ background: t.color }}
                >
                  {t.area}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
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
