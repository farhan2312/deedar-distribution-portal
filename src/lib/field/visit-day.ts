import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { visits } from "@/db/schema";
import { istDayBounds } from "@/lib/date";

/** Message shown wherever a second visit to the same counter is blocked. Kept
 * beside the lookup so the visit page and `createVisit` word it identically —
 * same arrangement as `START_DAY_REQUIRED`. */
export const ALREADY_VISITED_TODAY =
  "You've already visited this counter today. Edit that visit instead of adding a new one.";

/**
 * The visit this rep already logged at this counter today (IST), if any.
 *
 * A counter is called on once per beat, so a second visit on the same day is
 * a correction to the first, not a new event — recording it twice would
 * double-count the packets in every "sold today" figure on the SO and HQ
 * dashboards. The caller sends the rep to edit the returned visit instead.
 *
 * Scoped to the rep AND the day: two different reps visiting the same counter
 * is legitimate (a handover, or an SO-assigned beat overlapping), and so is
 * the same rep returning tomorrow.
 */
export async function findTodaysVisit(
  userId: string,
  counterId: string,
): Promise<{ id: string; visitedAt: Date } | null> {
  const { start, end } = istDayBounds();
  const [row] = await db
    .select({ id: visits.id, visitedAt: visits.visitedAt })
    .from(visits)
    .where(
      and(
        eq(visits.userId, userId),
        eq(visits.counterId, counterId),
        gte(visits.visitedAt, start),
        lt(visits.visitedAt, end),
      ),
    )
    .limit(1);
  return row ?? null;
}
