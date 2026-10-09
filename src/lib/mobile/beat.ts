import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, users, visits } from "@/db/schema";
import type { getCurrentUser } from "@/lib/auth/dal";
import { istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Today's Beat for the app.
 *
 * Mirrors the website's `/field/beat` page (which reads inline, so it can't be
 * called from here) — same scoping, same "visited" / "done by" rules. Keep the
 * two in step if either changes.
 */
export async function getMobileBeat(user: CurrentUser) {
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    return {
      assigned: false as const,
      message: "You aren't assigned to a stockist yet — ask your Sales Officer to map you to one.",
    };
  }

  const { start, end } = istDayBounds();
  const today = istDateString();

  const todaysBeat = isAdmin
    ? eq(beatAssignments.beatDate, today)
    : and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today));
  const dayBounds = and(gte(visits.visitedAt, start), lt(visits.visitedAt, end));

  const [assignmentRows, counterRows, visitCountRows, newCounterCountRows, allVisitedRows] =
    await Promise.all([
      db
        .select({
          counterId: beatAssignments.counterId,
          repUserId: beatAssignments.repUserId,
          repName: users.name,
        })
        .from(beatAssignments)
        .innerJoin(users, eq(users.id, beatAssignments.repUserId))
        .where(todaysBeat),
      db
        .select({
          id: counters.id,
          name: counters.name,
          type: counters.type,
          typeOther: counters.typeOther,
          areaName: areas.name,
          stockistId: counters.stockistId,
        })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(
          inArray(
            counters.id,
            db.select({ id: beatAssignments.counterId }).from(beatAssignments).where(todaysBeat),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(visits)
        .where(isAdmin ? dayBounds : and(eq(visits.userId, user.id), dayBounds)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(counters)
        .where(
          isAdmin
            ? and(gte(counters.createdAt, start), lt(counters.createdAt, end))
            : and(
                eq(counters.createdByUserId, user.id),
                gte(counters.createdAt, start),
                lt(counters.createdAt, end),
              ),
        ),
      db
        .select({ userId: visits.userId, counterId: visits.counterId, repName: users.name })
        .from(visits)
        .innerJoin(users, eq(users.id, visits.userId))
        .where(
          and(
            dayBounds,
            inArray(
              visits.counterId,
              db.select({ id: beatAssignments.counterId }).from(beatAssignments).where(todaysBeat),
            ),
          ),
        ),
    ]);

  const counterById = new Map(counterRows.map((c) => [c.id, c]));
  const visitedPairs = new Set(allVisitedRows.map((v) => `${v.userId}__${v.counterId}`));
  const visitedBy = new Map(allVisitedRows.map((v) => [v.counterId, v]));

  const beat = assignmentRows.flatMap((a) => {
    const c = counterById.get(a.counterId);
    if (!c) return [];
    const otherVisit = visitedBy.get(a.counterId);
    return [
      {
        key: `${a.repUserId}__${a.counterId}`,
        id: a.counterId,
        name: c.name,
        type: counterTypeLabel(c.type, c.typeOther),
        areaName: c.areaName,
        canVisit: isAdmin || c.stockistId === user.depot?.id,
        visitedToday: visitedPairs.has(`${a.repUserId}__${a.counterId}`),
        // Set only when someone else got there first — a counter is visited
        // once a day, so a colleague's call closes it for everyone.
        lockedBy:
          !isAdmin && otherVisit && otherVisit.userId !== a.repUserId ? otherVisit.repName : null,
        repName: isAdmin ? a.repName : null,
      },
    ];
  });

  return {
    assigned: true as const,
    isAdmin,
    stockistName: user.depot?.name ?? "—",
    visitsToday: visitCountRows[0]?.n ?? 0,
    newCountersToday: newCounterCountRows[0]?.n ?? 0,
    remaining: beat.filter((c) => !c.visitedToday && !c.lockedBy).length,
    beat,
  };
}
