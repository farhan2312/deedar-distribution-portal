import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { users, visits } from "@/db/schema";
import { istDayBounds } from "@/lib/date";

// Re-exported so callers that already import from here keep working; the
// strings live in a DB-free module the client form can import too.
export { ALREADY_VISITED_TODAY, visitedByOther } from "./visit-messages";

export type TodaysVisit = {
  id: string;
  visitedAt: Date;
  userId: string;
  userName: string;
  /** True when the logged-in rep is the one who recorded it. */
  isOwn: boolean;
};

/**
 * The visit already logged at this counter today (IST), by ANY rep.
 *
 * A counter is called on once per day, full stop — a second visit is either a
 * correction to the first or a duplicate, and recording it doubles the packets
 * in every "sold today" figure on the SO and HQ dashboards.
 *
 * Deliberately NOT scoped to the caller: an earlier version only caught the
 * same rep twice, which let two reps on overlapping beats both log the same
 * shop. `isOwn` tells the caller which message to show — the owner is sent to
 * edit, anyone else is told who got there first.
 *
 * This is enforced in the application, not by a unique index, because the
 * existing data already violates the rule (dozens of counter+day duplicates
 * predate it) and an index could not be created without editing history first.
 * The consequence is that two reps submitting in the same instant could both
 * pass this check; a constraint would be needed to close that.
 */
export async function findTodaysVisit(
  currentUserId: string,
  counterId: string,
): Promise<TodaysVisit | null> {
  const { start, end } = istDayBounds();
  const [row] = await db
    .select({
      id: visits.id,
      visitedAt: visits.visitedAt,
      userId: visits.userId,
      userName: users.name,
    })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(
      and(
        eq(visits.counterId, counterId),
        gte(visits.visitedAt, start),
        lt(visits.visitedAt, end),
      ),
    )
    .limit(1);

  return row ? { ...row, isOwn: row.userId === currentUserId } : null;
}
