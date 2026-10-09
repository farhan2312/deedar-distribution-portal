import "server-only";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs, visits, type VisitItem } from "@/db/schema";
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
import { qtyFromItems, SEGMENTS, totalOf, zeroQty, type SegQty } from "@/lib/field/day-stock";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";

/** How many previous days the app lists — the web Day Log shows the last week. */
const HISTORY_DAYS = 7;

/**
 * Everything the app's Day Log screen shows, for one ISR.
 *
 * Mirrors the data the website's `/field/day-log` page builds (that page does
 * its reading inline, so it can't be called from here) using the same date,
 * stock and label helpers — keep the two in step if either changes.
 */
export async function getMobileDayLog(userId: string) {
  const today = istDateString();
  const dayBounds = istDayBounds();

  const [logs, visitItemRows] = await Promise.all([
    db.select().from(dayLogs).where(eq(dayLogs.userId, userId)).orderBy(desc(dayLogs.logDate)),
    db
      .select({ items: visits.items })
      .from(visits)
      .where(
        and(
          eq(visits.userId, userId),
          gte(visits.visitedAt, dayBounds.start),
          lt(visits.visitedAt, dayBounds.end),
        ),
      ),
  ]);

  const todayLog = logs.find((l) => l.logDate === today) ?? null;
  const started = !!todayLog?.startAt;
  const ended = !!todayLog?.endAt;

  // Sold today, per SKU — only counted once the day is started, as on the web.
  const soldToday = zeroQty();
  for (const row of started ? visitItemRows : []) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (it && it.segment in soldToday) soldToday[it.segment] += Number(it.sold) || 0;
    }
  }

  const pickup = qtyFromItems(todayLog?.pickupItems);
  const remaining = qtyFromItems(todayLog?.remainingItems);
  const expectedRemaining = SEGMENTS.reduce<SegQty>((acc, seg) => {
    acc[seg] = Math.max(0, pickup[seg] - soldToday[seg]);
    return acc;
  }, zeroQty());

  // This week, Monday..today. A day counts once it is clocked in.
  const weekStart = mondayOf(today);
  const weekLogs = logs.filter((l) => l.logDate >= weekStart && l.logDate <= today);
  const daysLogged = weekLogs.filter((l) => l.startAt).length;
  const daysElapsed = isoWeekday(today);
  const now = new Date();
  const onJobMinutes = weekLogs.reduce((sum, l) => {
    if (!l.startAt) return sum;
    const end = l.endAt ?? (l.logDate === today ? now : null);
    if (!end) return sum;
    return sum + Math.max(0, (end.getTime() - l.startAt.getTime()) / 60000);
  }, 0);

  return {
    greeting: istGreeting(),
    todayLabel: formatISTDateLong(),
    /** The SKUs to count, in display order — from the server so the app never
     * hard-codes a product list. */
    products: PRODUCT_SEGMENTS,
    today: {
      started,
      ended,
      startLabel: todayLog?.startAt ? formatISTTime(todayLog.startAt) : "Not started yet",
      endLabel: todayLog?.endAt ? formatISTTime(todayLog.endAt) : "Not ended yet",
      onJobLabel: durationLabel(todayLog?.startAt ?? null, todayLog?.endAt ?? null),
      pickup,
      remaining,
      soldToday,
      expectedRemaining,
      pickupTotal: totalOf(pickup),
      remainingTotal: totalOf(remaining),
      soldTotal: totalOf(soldToday),
    },
    week: {
      daysLogged,
      onJobLabel: minutesLabel(onJobMinutes),
      pct: daysElapsed > 0 ? Math.round((daysLogged / daysElapsed) * 100) : 0,
    },
    history: logs
      .filter((l) => l.logDate !== today)
      .slice(0, HISTORY_DAYS)
      .map((l) => ({
        logDate: l.logDate,
        dateLabel: formatISTDate(l.logDate),
        startLabel: formatISTTime(l.startAt),
        endLabel: formatISTTime(l.endAt),
        onJobLabel: durationLabel(l.startAt, l.endAt),
        pickupTotal: l.pickupTotal,
        remainingTotal: l.remainingTotal,
      })),
  };
}

/** Same as the web page's helper: Monday's date for the week of an IST date. */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (weekday - 1));
  return date.toISOString().slice(0, 10);
}

/** 1 (Monday) .. 7 (Sunday) for an IST calendar date. */
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** A per-SKU count from a request body, or undefined. The day-log actions
 * clamp every value themselves; this only drops anything that isn't an object. */
export function qtyFromBody(value: unknown): SegQty | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const qty = zeroQty();
  for (const seg of SEGMENTS) qty[seg] = Number(source[seg]) || 0;
  return qty;
}
