import "server-only";
import { istDateString } from "@/lib/date";

/**
 * Year / month scoping for the company dashboard.
 *
 * Everything is an IST calendar period converted to a UTC `[start, end)` window
 * for `visited_at` / `created_at` comparisons — the same fixed +5:30 convention
 * the rest of the app uses.
 */

export type PeriodParams = { year?: string; month?: string };

export type Period = {
  year: number;
  /** 1-12, or null for a whole year. */
  month: number | null;
  /** UTC window for the selected period. */
  start: Date;
  end: Date;
  /** Equivalent window one period earlier — for period-over-period deltas. */
  prevStart: Date;
  prevEnd: Date;
  /** True when the period includes today, so totals are "so far" not final. */
  isCurrent: boolean;
  /** Years offered in the picker, newest first. */
  years: number[];
  /** Human label, e.g. "Aug 2026" or "2026". */
  label: string;
};

/** Short month keys, in order. Exported so the Server Component can import an
 * actual array — importing this from the `"use client"` picker instead hands a
 * server render a client-reference proxy, not the array (`.map` blows up). */
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** IST midnight on the 1st of a month, as a UTC instant. */
function istMonthStart(year: number, month: number): Date {
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`);
}

/** Exclusive end = start of the following month. */
function istMonthEnd(year: number, month: number): Date {
  return month === 12 ? istMonthStart(year + 1, 1) : istMonthStart(year, month + 1);
}

/** Days in an IST calendar month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Resolve `?year=&month=` into a concrete period.
 *
 * `earliestYear` comes from the oldest visit in the DB so the year dropdown
 * only offers years that could contain data (falling back to the current year
 * on an empty database).
 */
export function resolvePeriod(params: PeriodParams, earliestYear: number | null): Period {
  const todayIst = istDateString();
  const curYear = Number(todayIst.slice(0, 4));
  const curMonth = Number(todayIst.slice(5, 7));

  const firstYear = Math.min(earliestYear ?? curYear, curYear);
  const years: number[] = [];
  for (let y = curYear; y >= firstYear; y--) years.push(y);

  const rawYear = Number(params.year);
  const year = years.includes(rawYear) ? rawYear : curYear;

  const rawMonth = Number(params.month);
  const month =
    params.month != null && Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
      ? rawMonth
      : null;

  if (month == null) {
    // Whole year. Previous period = the whole previous year.
    const start = istMonthStart(year, 1);
    const end = istMonthStart(year + 1, 1);
    return {
      year,
      month: null,
      start,
      end,
      prevStart: istMonthStart(year - 1, 1),
      prevEnd: istMonthStart(year, 1),
      isCurrent: year === curYear,
      years,
      label: String(year),
    };
  }

  // Single month. Previous period = the calendar month before it.
  const start = istMonthStart(year, month);
  const end = istMonthEnd(year, month);
  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;
  return {
    year,
    month,
    start,
    end,
    prevStart: istMonthStart(py, pm),
    prevEnd: istMonthEnd(py, pm),
    isCurrent: year === curYear && month === curMonth,
    years,
    label: `${MONTH_SHORT[month - 1]} ${year}`,
  };
}

/**
 * When the selected period is the CURRENT one, comparing a part-elapsed period
 * against a complete previous one understates the delta badly (day 3 of a
 * month vs. a full previous month always looks catastrophic). Truncating the
 * comparison window to the same elapsed length makes it like-for-like.
 */
export function likeForLikePrevEnd(p: Period): Date {
  if (!p.isCurrent) return p.prevEnd;
  const elapsedMs = Date.now() - p.start.getTime();
  const capped = new Date(p.prevStart.getTime() + elapsedMs);
  return capped < p.prevEnd ? capped : p.prevEnd;
}
