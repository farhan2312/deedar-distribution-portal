import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { assignedTodayIn, resolveMapScope, visitedTodayIn } from "@/lib/portal/map-scope";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import type { CounterPin } from "../../_components/live-map";
import { MapScopePickers } from "../../_components/map-scope-pickers";
import { FieldMapView } from "./field-map-view";

export default async function FieldMapPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string; area?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("Live map")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }

  const params = await searchParams;
  const isAdmin = user.accessRoles.includes("admin");
  const { start, end } = istDayBounds();
  const today = istDateString();

  // Central Admin gets the full C&F → Depot → Area cascade; an ISR gets their
  // own areas. Either way the scope resolves to one predicate on `counters`.
  const scope = await resolveMapScope(user, "field", params);

  // An ISR's map is their areas UNION today's beat — the Sales Officer can put
  // a counter outside their areas on the beat, and it must still show up.
  // Admins already see everything in scope, so there's nothing to union in.
  // Today's beat for this rep. Narrowing to a single area is a deliberate
  // filter, so off-area beat counters drop out of that view rather than
  // leaking back in.
  const myBeat = db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));

  // Counters, beat, visited and assigned all at once. The counter query unions
  // the beat as a subquery rather than waiting for the list of ids, which is
  // what used to make these three separate waits.
  const [beatIds, rows, visitedIds, adminAssigned] = await Promise.all([
    isAdmin
      ? Promise.resolve(new Set<string>())
      : myBeat.then((r) => new Set(r.map((b) => b.counterId))),
    db
      .select({
        id: counters.id,
        name: counters.name,
        type: counters.type,
        typeOther: counters.typeOther,
        areaName: areas.name,
        lat: counters.lat,
        lng: counters.lng,
        lastVisitAt: counters.lastVisitAt,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(
        !isAdmin && !scope.area
          ? or(scope.where, inArray(counters.id, myBeat))
          : scope.where,
      ),
    // "Visited today" means the logged-in rep for an ISR, but ANY rep for an
    // admin — they're auditing coverage, not their own round.
    isAdmin
      ? visitedTodayIn(scope.where, { start, end })
      : db
          .select({ counterId: visits.counterId })
          .from(visits)
          .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end)))
          .then((r) => new Set(r.map((v) => v.counterId))),
    // Same for the beat: an admin's grey pins are any rep's pending calls.
    isAdmin ? assignedTodayIn(scope.where, today) : Promise.resolve(new Set<string>()),
  ]);
  const assignedIds = isAdmin ? adminAssigned : beatIds;

  // Leaflet plots real coordinates, so a counter without GPS can't be mapped.
  const geoCounters = rows.filter((c) => c.lat != null && c.lng != null);
  const missingGps = rows.length - geoCounters.length;

  const mapCounters: CounterPin[] = geoCounters.map((c) => ({
    id: c.id,
    name: c.name,
    type: counterTypeLabel(c.type, c.typeOther),
    area: c.areaName,
    lat: Number(c.lat),
    lng: Number(c.lng),
    visited: visitedIds.has(c.id),
    // "assigned" drives the grey "pending" colour — reserved for today's beat.
    // A counter that isn't on any beat stays yellow.
    assigned: assignedIds.has(c.id),
    stock: 0,
    lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : null,
  }));

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <FieldMapView
        scopeLabel={scope.label}
        counters={mapCounters}
        missingGps={missingGps}
        controls={<MapScopePickers levels={scope.levels} />}
      />
    </div>
  );
}
