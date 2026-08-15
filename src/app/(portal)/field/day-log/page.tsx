import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import {
  durationLabel,
  formatISTDate,
  formatISTDateLong,
  formatISTTime,
  istDateString,
  istGreeting,
  minutesLabel,
} from "@/lib/date";
import { Notice } from "@/components/ui/notice";
import { DayLogClient, type HistoryRow } from "./day-log-client";

/** Monday's "YYYY-MM-DD" for the week containing `dateStr`. Pure calendar-date
 * arithmetic on the Y/M/D components — `dateStr` is already an IST calendar
 * date (from `istDateString`), so this doesn't need any timezone conversion of
 * its own; redoing one here would risk shifting the day by re-applying an
 * offset that's already baked in. */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoWeekday = date.getUTCDay() || 7; // 0 (Sun) -> 7, so Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() - (isoWeekday - 1));
  return date.toISOString().slice(0, 10);
}

/** 1 (Monday) .. 7 (Sunday) for an IST calendar date — how many days into the
 * week `dateStr` falls, used as "days elapsed this week" for today. */
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export default async function FieldDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="Day Log">You don&apos;t have Field Salesman ISR access.</Notice>;
  }

  const today = istDateString();
  const logs = await db
    .select()
    .from(dayLogs)
    .where(eq(dayLogs.userId, user.id))
    .orderBy(desc(dayLogs.logDate));

  const todayLog = logs.find((l) => l.logDate === today) ?? null;
  const history: HistoryRow[] = logs
    .filter((l) => l.logDate !== today)
    .map((l) => ({
      dateLabel: formatISTDate(l.logDate),
      startLabel: formatISTTime(l.startAt),
      endLabel: formatISTTime(l.endAt),
      onJobLabel: durationLabel(l.startAt, l.endAt),
    }));

  // This-week banner stats (Mon..today). A day "counts" once it's clocked in,
  // whether or not it's ended yet — matches how "Today's Plan" itself treats
  // `started` as the day being logged.
  const weekStart = mondayOf(today);
  const weekLogs = logs.filter((l) => l.logDate >= weekStart && l.logDate <= today);
  const daysLoggedThisWeek = weekLogs.filter((l) => l.startAt).length;
  const daysElapsedThisWeek = isoWeekday(today);
  const weekPct = daysElapsedThisWeek > 0 ? Math.round((daysLoggedThisWeek / daysElapsedThisWeek) * 100) : 0;
  const now = new Date();
  const totalOnJobMinutesThisWeek = weekLogs.reduce((sum, l) => {
    if (!l.startAt) return sum;
    // Today's still-open log counts its elapsed time so far, so the total
    // ticks up live rather than excluding the current day until it ends.
    const end = l.endAt ?? (l.logDate === today ? now : null);
    if (!end) return sum;
    return sum + Math.max(0, (end.getTime() - l.startAt.getTime()) / 60000);
  }, 0);

  return (
    <DayLogClient
      greeting={istGreeting()}
      firstName={user.name.split(/\s+/)[0]}
      todayLabel={formatISTDateLong()}
      started={!!todayLog?.startAt}
      ended={!!todayLog?.endAt}
      startLabel={todayLog?.startAt ? formatISTTime(todayLog.startAt) : "Not started yet"}
      endLabel={todayLog?.endAt ? formatISTTime(todayLog.endAt) : "Not ended yet"}
      onJobLabel={durationLabel(todayLog?.startAt ?? null, todayLog?.endAt ?? null)}
      history={history}
      daysLoggedThisWeek={daysLoggedThisWeek}
      totalOnJobLabelThisWeek={minutesLabel(totalOnJobMinutesThisWeek)}
      weekPct={weekPct}
    />
  );
}
