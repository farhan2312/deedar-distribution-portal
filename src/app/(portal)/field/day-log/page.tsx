import { redirect } from "next/navigation";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs, visits, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import {
  durationLabel,
  formatISTDate,
  formatISTDateLong,
  formatISTTime,
  istDateString,
  istDayBounds,
  istGreeting,
  minutesLabel,
} from "@/lib/date";
import { qtyFromItems, zeroQty } from "@/lib/field/day-stock";
import { getT } from "@/lib/i18n/server";
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
    const t = await getT();
    return <Notice title={t("Day Log")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }
  const t = await getT();

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
      pickupTotal: l.pickupTotal,
      remainingTotal: l.remainingTotal,
    }));

  // Packets sold per SKU across today s visits by this rep — the middle term
  // in "picked up − sold = remaining". Summed in JS from the items JSONB for
  // the same reason the dashboards do: a jsonb SRF join errors on any
  // non-array legacy row.
  const dayBounds = istDayBounds();
  const todayVisitItems = todayLog?.startAt
    ? await db
        .select({ items: visits.items })
        .from(visits)
        .where(
          and(
            eq(visits.userId, user.id),
            gte(visits.visitedAt, dayBounds.start),
            lt(visits.visitedAt, dayBounds.end),
          ),
        )
    : [];
  const soldToday = zeroQty();
  for (const row of todayVisitItems) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (it && it.segment in soldToday) soldToday[it.segment] += Number(it.sold) || 0;
    }
  }

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
      startLabel={todayLog?.startAt ? formatISTTime(todayLog.startAt) : t("Not started yet")}
      endLabel={todayLog?.endAt ? formatISTTime(todayLog.endAt) : t("Not ended yet")}
      onJobLabel={durationLabel(todayLog?.startAt ?? null, todayLog?.endAt ?? null)}
      history={history}
      daysLoggedThisWeek={daysLoggedThisWeek}
      totalOnJobLabelThisWeek={minutesLabel(totalOnJobMinutesThisWeek)}
      weekPct={weekPct}
      pickup={qtyFromItems(todayLog?.pickupItems)}
      remaining={qtyFromItems(todayLog?.remainingItems)}
      soldToday={soldToday}
    />
  );
}
