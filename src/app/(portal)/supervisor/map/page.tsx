import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import {
  getCountersAssignedToday,
  getCountersVisitedToday,
  getLatestVisitStock,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
} from "@/lib/supervisor/team";
import { resolveMapScope } from "@/lib/portal/map-scope";
import { canAccess } from "@/lib/auth/access";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { MapScopePickers } from "../../_components/map-scope-pickers";
import { TeamMapView, repStatus, type TeamRepRow } from "../../_components/team-map-view";
import type { CounterPin, RepMeta } from "../../_components/live-map";

export default async function SupervisorMapPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string; area?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("Live map")}>{t("You don't have Sales Officer access.")}</Notice>;
  }
  const t = await getT();

  // Depot → Area for a Sales Officer; Central Admin also gets the C&F level.
  const scope = await resolveMapScope(user, "supervisor", await searchParams);
  const depotIds = scope.depotIds;

  // The roster follows the depot level only — an area narrows counters, not
  // people, since a rep belongs to a depot rather than to one area.
  const allReps = await getTeamReps(user, scope.depot?.id);
  const reps =
    !scope.depot && depotIds
      ? allReps.filter((r) => r.depotId != null && depotIds.includes(r.depotId))
      : allReps;
  const repIds = reps.map((r) => r.id);
  const today = istDateString();
  const bounds = istDayBounds();

  const [dayLogs, visitMap, visitedCounterIds, counterRows] = await Promise.all([
    getTeamDayLogs(repIds, today),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    db
      .select({
        id: counters.id,
        name: counters.name,
        type: counters.type,
        typeOther: counters.typeOther,
        area: areas.name,
        lat: counters.lat,
        lng: counters.lng,
        lastVisitAt: counters.lastVisitAt,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(scope.where),
  ]);

  // Leaflet plots real coordinates, so only geo-tagged counters are mappable.
  const geoCounters = counterRows.filter((c) => c.lat != null && c.lng != null);
  const geoIds = geoCounters.map((c) => c.id);
  const [stockByCounter, assignedCounterIds] = await Promise.all([
    getLatestVisitStock(geoIds),
    getCountersAssignedToday(geoIds, today),
  ]);

  const mapCounters: CounterPin[] = geoCounters.map((c) => ({
    id: c.id,
    name: c.name,
    type: counterTypeLabel(c.type, c.typeOther),
    area: c.area,
    lat: Number(c.lat),
    lng: Number(c.lng),
    visited: visitedCounterIds.has(c.id),
    assigned: assignedCounterIds.has(c.id),
    stock: stockByCounter.get(c.id) ?? 0,
    lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : null,
  }));

  const mapReps: RepMeta[] = reps.map((r) => ({ id: r.id, name: r.name }));

  const repRows: TeamRepRow[] = reps.map((r) => {
    const v = visitMap.get(r.id);
    const log = dayLogs.get(r.id);
    const last = v?.last ?? null;
    return {
      id: r.id,
      name: r.name,
      status: repStatus(log?.startAt ?? null, log?.endAt ?? null, (v?.count ?? 0) > 0),
      area: last?.area ?? r.depotName ?? "—",
      visits: v?.count ?? 0,
      counters: v?.counters ?? 0,
      lastLabel: last ? `${last.counterName} · ${formatISTTime(last.visitedAt)}` : "—",
      onJob: durationLabel(log?.startAt ?? null, log?.endAt ?? new Date()),
      started: !!log?.startAt,
    };
  });

  return (
    <TeamMapView
      scopeLabel={scope.label}
      repRows={repRows}
      mapCounters={mapCounters}
      mapReps={mapReps}
      controls={<MapScopePickers levels={scope.levels} />}
      emptyMessage={
        scope.depot
          ? t("No field reps report to you in this depot yet.")
          : t("No field reps report to you yet.")
      }
    />
  );
}
