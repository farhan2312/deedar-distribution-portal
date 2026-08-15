import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { Notice } from "@/components/ui/notice";
import type { CounterPin } from "../../_components/live-map";
import { FieldMapView } from "./field-map-view";

export default async function FieldMapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="Live map">You don&apos;t have Field Salesman ISR access.</Notice>;
  }

  const { start, end } = istDayBounds();
  const today = istDateString();

  // Same source as the Beat screen: ONLY counters the Sales Officer assigned
  // for today. Keeping the two in step matters — a counter on the map but not
  // in the Beat (or vice versa) would be confusing in the field.
  const todaysAssignments = await db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));
  const assignedIds = todaysAssignments.map((a) => a.counterId);

  const [rows, todaysVisits] = await Promise.all([
    assignedIds.length
      ? db
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
          .where(inArray(counters.id, assignedIds))
      : Promise.resolve([]),
    db
      .select({ counterId: visits.counterId })
      .from(visits)
      .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end))),
  ]);

  const visitedIds = new Set(todaysVisits.map((v) => v.counterId));

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
    // Everything here is on today's beat by definition, so anything not yet
    // visited renders as "pending" rather than a plain counter.
    assigned: true,
    stock: 0,
    lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : null,
  }));

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Live map
        </h1>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          Your beat for today, nearest first.
          {missingGps > 0 && (
            <span style={{ color: "var(--warning)" }}>
              {" "}
              {missingGps} counter{missingGps === 1 ? "" : "s"} without GPS not shown.
            </span>
          )}
        </p>
      </div>

      <FieldMapView counters={mapCounters} />
    </div>
  );
}
