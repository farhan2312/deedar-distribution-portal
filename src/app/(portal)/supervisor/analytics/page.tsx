import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, istDayBounds, istDateString } from "@/lib/date";
import {
  getCountersVisitedToday,
  getScopeDepots,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  pickDepot,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { LegendDot } from "@/components/ui/legend-dot";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";

const DENSITY_COLORS = ["#1E6B3C", "#7AB88A", "#E0B15C", "#C7263B"];
// Nominal daily visit target per rep — bars are relative to this.
const DAILY_TARGET = 50;

export default async function SupervisorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("Analytics")}>{t("You don't have Sales Officer access.")}</Notice>;
  }
  const t = await getT();

  const { depot: requestedDepot } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);
  const depotIds = depot ? [depot.id] : depots.map((d) => d.id);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);
  const today = istDateString();
  const bounds = istDayBounds();

  const [dayLogs, visitMap, coveredToday, areaRows] = await Promise.all([
    getTeamDayLogs(repIds, today),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    depotIds.length
      ? db
          .select({ area: areas.name, status: counters.status })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.depotId, depotIds))
      : Promise.resolve([]),
  ]);

  const activeReps = repIds.filter((id) => dayLogs.get(id)?.startAt).length;
  const openDays = repIds.filter((id) => {
    const l = dayLogs.get(id);
    return l?.startAt && !l.endAt;
  }).length;
  const totalVisits = [...visitMap.values()].reduce((s, v) => s + v.count, 0);
  const declining = areaRows.filter((r) => r.status === "declining").length;

  // Retail density: counters per area in scope.
  const byArea = new Map<string, number>();
  for (const r of areaRows) byArea.set(r.area, (byArea.get(r.area) ?? 0) + 1);
  const densityTiles = [...byArea.entries()].map(([area, count]) => ({
    area,
    color: DENSITY_COLORS[count >= 4 ? 0 : count >= 2 ? 1 : count >= 1 ? 2 : 3],
  }));

  const scopeLabel = depot?.name ?? (depots.length > 1 ? t("all depots") : depots[0]?.name ?? t("your depot"));
  const kpis = [
    { value: `${activeReps}/${reps.length}`, label: t("Active reps"), trend: t("clocked in today"), trendColor: "var(--ink-3)" },
    { value: String(totalVisits), label: t("Visits today"), trend: t("team total"), trendColor: "var(--success)" },
    { value: String(coveredToday.size), label: t("Counters covered"), trend: t("distinct today"), trendColor: "var(--ink-3)" },
    { value: String(areaRows.length), label: t("Counters in scope"), trend: t("in depot"), trendColor: "var(--ink-3)" },
    { value: String(declining), label: t("Declining"), trend: t("needs attention"), trendColor: "var(--danger)" },
    { value: String(openDays), label: t("Open days"), trend: openDays ? t("not clocked out") : t("all closed"), trendColor: openDays ? "var(--warning)" : "var(--success)" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        {/* Page title comes from the shell; this carries the scope in view. */}
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {scopeLabel}
        </h4>
        <div className="flex items-center gap-3">
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Reps who report to you")}</span>
          {depots.length > 1 && <DepotPicker options={depots} value={depot?.id ?? "all"} />}
        </div>
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
            {t("Visits today by rep")}
          </h6>
          {reps.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No reps report to you yet.")}</p>
          ) : (
            reps.map((r) => {
              const v = visitMap.get(r.id);
              const log = dayLogs.get(r.id);
              const pct = Math.min(100, Math.round(((v?.count ?? 0) / DAILY_TARGET) * 100));
              const onJob = durationLabel(log?.startAt ?? null, log?.endAt ?? new Date());
              return (
                <div key={r.id} className="py-2.5" style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>{r.name}</div>
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {v?.count ?? 0}/{DAILY_TARGET} {t("visits")}
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "var(--hairline-soft)" }}>
                    <div style={{ width: `${pct}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="mt-1.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {v?.counters ?? 0} {t("counters covered")} · {log?.startAt ? `${onJob} ${t("on job")}` : t("not started")}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card p-5">
          <h6 className="mb-3.5 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Retail density by area (counters)")}
          </h6>
          {densityTiles.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No counters in scope yet.")}</p>
          ) : (
            <div className="mb-3.5 grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-2">
              {densityTiles.map((tile) => (
                <div
                  key={tile.area}
                  className="flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[11px] font-semibold text-white"
                  style={{ background: tile.color }}
                >
                  {tile.area}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <LegendDot color="#1E6B3C" label={t("Hot")} />
            <LegendDot color="#7AB88A" label={t("Active")} />
            <LegendDot color="#E0B15C" label={t("Thin")} />
            <LegendDot color="#C7263B" label={t("Gap")} />
          </div>
        </div>
      </div>
    </div>
  );
}
