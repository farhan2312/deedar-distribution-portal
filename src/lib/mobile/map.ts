import "server-only";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, visits } from "@/db/schema";
import type { getCurrentUser } from "@/lib/auth/dal";
import { formatISTDate, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { assignedTodayIn, resolveMapScope, visitedTodayIn, type MapScopeParams } from "@/lib/portal/map-scope";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * The ISR's Live map: counters in their areas plus anything on today's beat,
 * each flagged visited / on the beat — mirrors the website's `/field/map` page
 * (which reads inline) using the same `resolveMapScope`. Keep the two in step.
 */
export async function getMobileMap(user: CurrentUser, params: MapScopeParams) {
  const isAdmin = user.accessRoles.includes("admin");
  const { start, end } = istDayBounds();
  const today = istDateString();

  const scope = await resolveMapScope(user, "field", params);

  const myBeat = db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));

  const [beatIds, rows, visitedIds, adminAssigned] = await Promise.all([
    isAdmin ? Promise.resolve(new Set<string>()) : myBeat.then((r) => new Set(r.map((b) => b.counterId))),
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
      // An off-area counter the SO put on today's beat still shows — unless
      // the ISR narrowed to one area on purpose.
      .where(!isAdmin && !scope.area ? or(scope.where, inArray(counters.id, myBeat)) : scope.where),
    isAdmin
      ? visitedTodayIn(scope.where, { start, end })
      : db
          .select({ counterId: visits.counterId })
          .from(visits)
          .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end)))
          .then((r) => new Set(r.map((v) => v.counterId))),
    isAdmin ? assignedTodayIn(scope.where, today) : Promise.resolve(new Set<string>()),
  ]);
  const assignedIds = isAdmin ? adminAssigned : beatIds;

  const geo = rows.filter((c) => c.lat != null && c.lng != null);

  return {
    label: scope.label,
    levels: scope.levels,
    missingGps: rows.length - geo.length,
    counters: geo.map((c) => ({
      id: c.id,
      name: c.name,
      type: counterTypeLabel(c.type, c.typeOther),
      area: c.areaName,
      lat: Number(c.lat),
      lng: Number(c.lng),
      visited: visitedIds.has(c.id),
      /** On today's beat — drawn grey ("pending") until visited. */
      assigned: assignedIds.has(c.id),
      lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : null,
    })),
    /** The same tile server and credit line the website's map uses. */
    tiles: {
      url: process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  };
}
