import "server-only";
import { istDateString } from "@/lib/date";
import {
  daysBetween,
  fyStartYear,
  isPeriodKey,
  matchPreset,
  periodBounds,
  shiftDays,
  type PeriodKey,
} from "./periods";

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

export type RangeParams = { from?: string; to?: string; period?: string };

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
  /** Human label, e.g. "FY 2026–27" or "1 Apr – 30 Jun 2026". */
  label: string;
  /** Qualifier for a label whose window hasn't closed yet — "so far", or "".
   * Separate from `label` so the page can style it down. */
  note: string;
  /** True when the range is exactly year-to-date. */
  isYtd: boolean;
  /** Which preset pill is lit, or null for a hand-picked window. */
  period: PeriodKey | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Re-exported: these were defined here before the client needed them, and
// plenty of server code still imports them from this module.
export { shiftDays, daysBetween };

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
 * Resolve `?period=` or `?from=&to=` into a concrete range.
 *
 * Precedence is explicit dates first, then a named preset, then the caller's
 * fallback preset. Explicit dates win because they are what the two calendar
 * inputs write, and a stale `?period=` left in the URL must not override the
 * date the viewer just picked.
 *
 * `earliestDate` comes from the oldest row in the DB — it bounds the calendar
 * inputs and defines what "All time" means. Hand-picked ends are clamped into
 * `[minDate, today]` and swapped if they arrive reversed, so a hand-edited URL
 * degrades to a sane range rather than an empty one.
 */
export function resolveRange(
  params: RangeParams,
  earliestDate: string | null,
  /** Which preset an untouched URL means. The dashboard and an ISR's page open
   * on the current financial year; Reports opens on all time, because a report
   * that silently hides last year's rows is a report nobody can trust. */
  fallback: PeriodKey = "fy",
): Range {
  const today = istDateString();
  const ytdStart = startOfYear(today);
  const dataStart = isDate(earliestDate) ? earliestDate : null;

  const preset = isPeriodKey(params.period) ? params.period : fallback;
  const presetBounds = periodBounds(preset, today, dataStart);

  // The calendar floor has to reach at least as far back as whatever is
  // selected, or the date inputs would carry a value below their own `min`.
  // It also always covers 1 Jan, so this year is reachable on a database
  // whose history starts in March.
  let earliest = ytdStart;
  if (dataStart && dataStart < earliest) earliest = dataStart;
  if (presetBounds.from < earliest) earliest = presetBounds.from;
  const minDate = earliest < today ? earliest : today;

  const clamp = (d: string) => (d < minDate ? minDate : d > today ? today : d);

  // Preset bounds are used as-is: they are correct by construction, and
  // clamping them to the calendar floor would collapse "Last FY" to a single
  // day on a database that only holds this year.
  const hasCustom = isDate(params.from) || isDate(params.to);
  let from = isDate(params.from) ? clamp(params.from) : presetBounds.from;
  let to = isDate(params.to) ? clamp(params.to) : presetBounds.to;
  if (from > to) [from, to] = [to, from];

  const days = daysBetween(from, to);
  // The comparison window is the same number of days ending the day before
  // `from` — so a 30-day range is always compared against the previous 30.
  const prevTo = shiftDays(from, -1);
  const prevFrom = shiftDays(prevTo, -(days - 1));

  const isYtd = from === ytdStart && to === today;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  // Custom dates still light a pill when they happen to equal one, so a link
  // pasted with ?from=&to= doesn't look like it has no filter applied.
  const period = hasCustom ? matchPreset(from, to, dataStart, today) : preset;

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
    period,
    label: presetLabel(period, from) ?? spanLabel(from, to, sameYear),
    // "Last 30 days" and "All time" are already whole phrases; only the
    // windows that run up to an unfinished today take the qualifier.
    note: period === "fy" || period === "month" || isYtd ? "so far" : "",
  };
}

/** "FY 2026–27" — the Indian financial year the date falls in. */
function fyLabel(dateStr: string): string {
  const y = fyStartYear(dateStr);
  return `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

function presetLabel(period: PeriodKey | null, from: string): string | null {
  switch (period) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "fy":
    case "lastfy":
      return fyLabel(from);
    case "month":
      return anchor(from).toLocaleDateString("en-GB", {
        timeZone: "Asia/Kolkata",
        month: "long",
        year: "numeric",
      });
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "all":
      return "All time";
    default:
      return null;
  }
}

function spanLabel(from: string, to: string, sameYear: boolean): string {
  if (from === to) return longDayLabel(from);
  if (!sameYear) return `${longDayLabel(from)} – ${longDayLabel(to)}`;
  const shortFrom = anchor(from).toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
  return `${shortFrom} – ${longDayLabel(to)}`;
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
