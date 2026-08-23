import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { istDateString } from "@/lib/date";

/** Message shown wherever field work is blocked on an unstarted day. Kept in
 * one place so the wizard, the visit form and the server actions all say the
 * same thing. */
export const START_DAY_REQUIRED = "Start your day log before adding counters or visits.";

/** Has this rep clocked in for today (IST)? Field work — new counters and
 * visits — is only allowed inside a started day. */
export async function hasStartedToday(userId: string): Promise<boolean> {
  const [log] = await db
    .select({ startAt: dayLogs.startAt })
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, userId), eq(dayLogs.logDate, istDateString())))
    .limit(1);
  return !!log?.startAt;
}
