import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import {
  getCountersAssignedToday,
  getCountersVisitedToday,
  getLatestVisitStock,
  getScopeDepots,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  pickDepot,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";
import { TeamMapView, repStatus, type TeamRepRow } from "../../_components/team-map-view";
import type { CounterPin, RepMeta } from "../../_components/live-map";

export default async function SupervisorMapPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Live map">You don&apos;t have Sales Officer access.</Notice>;
  }

  const { depot: requestedDepot } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);
  const depotIds = depot ? [depot.id] : depots.map((d) => d.id);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);
  const today = istDateString();
  const bounds = istDayBounds();

  const [dayLogs, visitMap, visitedCounterIds, counterRows] = await Promise.all([
    getTeamDayLogs(repIds, today),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    depotIds.length
      ? db
          .select({
            id: counters.id,
            name: counters.name,
            type: counters.type,
            area: areas.name,
            lat: counters.lat,
            lng: counters.lng,
            lastVisitAt: counters.lastVisitAt,
          })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.depotId, depotIds))
      : Promise.resolve([]),
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
    type: c.type,
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

  const scopeLabel = depot?.name ?? (depots.length > 1 ? "All Depots" : depots[0]?.name ?? "Your Depot");

  return (
    <TeamMapView
      scopeLabel={scopeLabel}
      repRows={repRows}
      mapCounters={mapCounters}
      mapReps={mapReps}
      controls={depots.length > 1 ? <DepotPicker options={depots} value={depot?.id ?? "all"} /> : null}
      emptyMessage={`No field reps report to you${depot ? " in this depot" : ""} yet.`}
    />
  );
}
