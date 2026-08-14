import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { durationLabel, formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import {
  getCountersAssignedToday,
  getCountersVisitedToday,
  getLatestVisitStock,
  getTeamDayLogs,
  getVisitsToday,
  pickDepot,
  type DepotOption,
} from "@/lib/supervisor/team";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { Notice } from "@/components/ui/notice";
import { CnfPicker } from "../_components/cnf-picker";
import { DepotPicker } from "../../supervisor/_components/depot-picker";
import { TeamMapView, repStatus, type TeamRepRow } from "../../_components/team-map-view";
import type { CounterPin, RepMeta } from "../../_components/live-map";

export default async function HqLiveMapPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.accessRoles.includes("admin");
  if (!canAccess(user, "hq")) {
    return <Notice title="Live map">You don&apos;t have C&amp;F HQ access.</Notice>;
  }

  const { cnf: requestedCnfId, depot: requestedDepot } = await searchParams;
  const allCnfs = await db.select().from(cnfs).orderBy(asc(cnfs.name));
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);
  if (!selectedCnf) {
    return (
      <Notice title="Live map">You aren&apos;t mapped to a C&amp;F yet — ask Central Admin.</Notice>
    );
  }

  // Depot-wise view: every depot under this C&F is selectable, or "all".
  const cnfDepots: DepotOption[] = await db
    .select({ id: depots.id, name: depots.name })
    .from(depots)
    .where(eq(depots.cnfId, selectedCnf.id))
    .orderBy(asc(depots.name));
  const depot = pickDepot(cnfDepots, requestedDepot);
  const depotIds = depot ? [depot.id] : cnfDepots.map((d) => d.id);

  // HQ sees every field rep in scope — not a reports-to team like an SO.
  const repRowsRaw = depotIds.length
    ? await db
        .select({ id: users.id, name: users.name, depotName: depots.name })
        .from(users)
        .innerJoin(depots, eq(depots.id, users.depotId))
        .where(
          and(inArray(users.depotId, depotIds), sql`'field' = ANY(${users.accessRoles}::text[])`),
        )
        .orderBy(asc(users.name))
    : [];
  const repIds = repRowsRaw.map((r) => r.id);

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
            typeOther: counters.typeOther,
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

  const mapReps: RepMeta[] = repRowsRaw.map((r) => ({ id: r.id, name: r.name }));

  const repRows: TeamRepRow[] = repRowsRaw.map((r) => {
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

  const scopeLabel = depot?.name ?? selectedCnf.name;

  return (
    <TeamMapView
      scopeLabel={scopeLabel}
      repRows={repRows}
      mapCounters={mapCounters}
      mapReps={mapReps}
      controls={
        <>
          {isAdmin && allCnfs.length > 1 && (
            <CnfPicker options={allCnfs.map((c) => ({ id: c.id, name: c.name }))} value={selectedCnf.id} />
          )}
          {cnfDepots.length > 1 && <DepotPicker options={cnfDepots} value={depot?.id ?? "all"} />}
        </>
      }
      emptyMessage={`No field reps in ${depot ? depot.name : selectedCnf.name} yet.`}
    />
  );
}
