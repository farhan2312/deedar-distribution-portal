import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, depots, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { resolveMapScope } from "@/lib/portal/map-scope";
import { durationLabel, formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import {
  getCountersAssignedToday,
  getCountersVisitedToday,
  getLatestVisitStock,
  getTeamDayLogs,
  getVisitsToday,
} from "@/lib/supervisor/team";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { MapScopePickers } from "../../_components/map-scope-pickers";
import { TeamMapView, repStatus, type TeamRepRow } from "../../_components/team-map-view";
import type { CounterPin, RepMeta } from "../../_components/live-map";

export default async function HqLiveMapPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string; area?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.accessRoles.includes("admin");
  const t = await getT();
  if (!canAccess(user, "hq")) {
    return <Notice title={t("Live map")}>{t("You don't have C&F HQ access.")}</Notice>;
  }

  // HQ is pinned to their own C&F and picks Depot → Area under it; Central
  // Admin also gets the C&F level and may zoom out to every C&F at once.
  const scope = await resolveMapScope(user, "hq", await searchParams);
  if (!isAdmin && !scope.cnf) {
    return (
      <Notice title={t("Live map")}>{t("You aren't mapped to a C&F yet — ask Central Admin.")}</Notice>
    );
  }
  const depotIds = scope.depotIds;

  // HQ sees every field rep in scope — not a reports-to team like an SO. A
  // null scope is admin-wide, so the depot filter drops away entirely.
  const isFieldRep = sql`'field' = ANY(${users.accessRoles}::text[])`;
  const repRowsRaw =
    depotIds && depotIds.length === 0
      ? []
      : await db
          .select({ id: users.id, name: users.name, depotName: depots.name })
          .from(users)
          .innerJoin(depots, eq(depots.id, users.depotId))
          .where(depotIds ? and(inArray(users.depotId, depotIds), isFieldRep) : isFieldRep)
          .orderBy(asc(users.name));
  const repIds = repRowsRaw.map((r) => r.id);

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

  return (
    <TeamMapView
      scopeLabel={scope.label}
      repRows={repRows}
      mapCounters={mapCounters}
      mapReps={mapReps}
      controls={<MapScopePickers levels={scope.levels} />}
      emptyMessage={`${scope.label} ${t("has no field reps yet.")}`}
    />
  );
}
