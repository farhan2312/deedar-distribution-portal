import "server-only";
import { istDateString } from "@/lib/date";

/**
 * Free date-range scoping for the company dashboard.
 *
 * This replaced a year + month dropdown pair. Those could only express two
 * shapes — one calendar month, or one calendar year — so "the last six weeks"
 * or "Q3 so far" were unaskable. A range says both, and YTD (the default) is
 * just one more range rather than a special case.
 *
 * Everything is an IST calendar date converted to a UTC `[start, end)` window
 * for `visited_at` / `created_at` comparisons — the same fixed +5:30
 * convention the rest of the app uses.
 */

export type RangeParams = { from?: string; to?: string };

export type Range = {
  /** Inclusive IST calendar dates, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** UTC window for the selected range. */
  start: Date;
  end: Date;
  /** Equally long window immediately before it — for period-over-period deltas. */
  prevStart: Date;
  prevEnd: Date;
  /** Whole days in the range, inclusive of both ends. */
  days: number;
  /** True when the range runs to today, so totals read as "so far". */
  isCurrent: boolean;
  /** Oldest selectable date — the first day that could hold data. */
  minDate: string;
  /** Newest selectable date: today. A future range would always be empty. */
  maxDate: string;
  /** Human label, e.g. "2026 so far" or "1 Apr – 30 Jun 2026". */
  label: string;
  /** True when the range is exactly year-to-date, the default. */
  isYtd: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** IST midnight on a calendar date, as a UTC instant. */
export function istStartOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+05:30`);
}

/** Exclusive end of a calendar date = IST midnight the following morning. */
export function istEndOf(dateStr: string): Date {
  return new Date(istStartOf(dateStr).getTime() + DAY_MS);
}

/** Midday UTC anchor — safe to add or subtract days from without an
 * off-by-one at the timezone edge. */
function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

export function shiftDays(dateStr: string, days: number): string {
  return istDateString(new Date(anchor(dateStr).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b`, inclusive of both ends. */
export function daysBetween(a: string, b: string): number {
  return Math.round((anchor(b).getTime() - anchor(a).getTime()) / DAY_MS) + 1;
}

function isDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** "1 Apr 2026" — the label form used at both ends of a range. */
export function longDayLabel(dateStr: string): string {
  return anchor(dateStr).toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Jan 1st of the year `dateStr` falls in. */
export function startOfYear(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-01-01`;
}

/**
 * Resolve `?from=&to=` into a concrete range, defaulting to year-to-date.
 *
 * `earliestDate` comes from the oldest visit in the DB so the slider can't
 * scroll back through empty years. Both ends are clamped into
 * `[minDate, today]` and swapped if they arrive reversed, so a hand-edited URL
 * degrades to a sane range rather than an empty one.
 */
export function resolveRange(
  params: RangeParams,
  earliestDate: string | null,
  /** What an absent `?from=&to=` means. The dashboard opens on the year so far;
   * an ISR's page opens on today, because "what did they do today" is the
   * question being asked when you click their name. */
  fallback: "ytd" | "today" = "ytd",
): Range {
  const today = istDateString();
  const ytdStart = startOfYear(today);

  // The slider floor: the older of "first data" and "Jan 1 this year", so the
  // default YTD range is always fully reachable on the track even on a
  // database whose history starts in March.
  const earliest = isDate(earliestDate) && earliestDate < ytdStart ? earliestDate : ytdStart;
  const minDate = earliest < today ? earliest : today;

  const clamp = (d: string) => (d < minDate ? minDate : d > today ? today : d);

  const defaultFrom = fallback === "today" ? today : ytdStart;
  let from = isDate(params.from) ? clamp(params.from) : defaultFrom;
  let to = isDate(params.to) ? clamp(params.to) : today;
  if (from > to) [from, to] = [to, from];

  const days = daysBetween(from, to);
  // The comparison window is the same number of days ending the day before
  // `from` — so a 30-day range is always compared against the previous 30.
  const prevTo = shiftDays(from, -1);
  const prevFrom = shiftDays(prevTo, -(days - 1));

  const isYtd = from === ytdStart && to === today;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);

  return {
    from,
    to,
    start: istStartOf(from),
    end: istEndOf(to),
    prevStart: istStartOf(prevFrom),
    prevEnd: istEndOf(prevTo),
    days,
    isCurrent: to === today,
    minDate,
    maxDate: today,
    isYtd,
    label: isYtd
      ? from.slice(0, 4)
      : from === to
        ? longDayLabel(from)
        : sameYear
          ? `${anchor(from).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} – ${longDayLabel(to)}`
          : `${longDayLabel(from)} – ${longDayLabel(to)}`,
  };
}

/**
 * Day buckets for a short range, month buckets for a long one.
 *
 * A year of daily bars is 365 slivers nobody can read or click; six weeks of
 * monthly bars is two. The threshold is the point where daily bars stop
 * fitting a card width at a legible size.
 */
export function trendGrain(days: number): "day" | "month" {
  return days > 92 ? "month" : "day";
}
