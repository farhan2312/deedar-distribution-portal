import { istDateString } from "@/lib/date";

/**
 * Period presets shared by the company dashboard, the ISR detail page and
 * Reports — and by the client component that renders them as pills.
 *
 * Deliberately NOT `server-only`: `PeriodFilter` is a client component and
 * needs the same key list and the same date arithmetic the server resolves
 * with, so a pill can light up without a round-trip. The pure date helpers
 * live here for the same reason; `lib/khq/range.ts` re-exports them so the
 * server-side callers that already import them keep working.
 */

export type PeriodKey =
  | "today"
  | "yesterday"
  | "month"
  | "30d"
  | "90d"
  | "fy"
  | "lastfy"
  | "all";

export type Preset = { key: PeriodKey; label: string };

/**
 * Every preset, narrowest first. `label` is an English i18n key, translated at
 * the point of render.
 *
 * Order matters twice over: it is the order the pills appear in, and
 * `matchPreset` returns the first key whose bounds fit, so a single day that
 * happens to be both "Today" and "This month" (the 1st) reads as Today.
 */
export const PERIOD_PRESETS: readonly Preset[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This month" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "fy", label: "This FY" },
  { key: "lastfy", label: "Last FY" },
  { key: "all", label: "All time" },
];

/**
 * The default pill row: spans only, no single days.
 *
 * A company-wide dashboard or a report is read in aggregate — "Today" there is
 * a nearly empty page, and it crowds out the windows people actually pick. The
 * ISR detail page passes the full list instead, because one person's single
 * day is exactly the question that page answers.
 */
export const SPAN_PRESETS: readonly Preset[] = PERIOD_PRESETS.filter(
  (p) => p.key !== "today" && p.key !== "yesterday",
);

export function isPeriodKey(s: string | undefined | null): s is PeriodKey {
  return !!s && PERIOD_PRESETS.some((p) => p.key === s);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midday IST anchor — safe to add or subtract days from without an
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

/**
 * The calendar year an Indian financial year starts in. FY runs 1 Apr → 31
 * Mar, so January 2027 belongs to the FY that started in April 2026.
 */
export function fyStartYear(dateStr: string): number {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  return month >= 4 ? year : year - 1;
}

/**
 * A preset's inclusive IST date bounds.
 *
 * `earliest` is the oldest date that could hold data; only "All time" uses it,
 * and it falls back to today so an empty database yields a valid single-day
 * range rather than an inverted one.
 *
 * Every preset except "Last FY" ends today — they answer "how are we doing",
 * which is a question about now. Last FY is a closed book, so it ends on its
 * own 31 March even when that is in the future relative to a mid-FY today.
 */
export function periodBounds(
  key: PeriodKey,
  today: string,
  earliest: string | null,
): { from: string; to: string } {
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const d = shiftDays(today, -1);
      return { from: d, to: d };
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    // Inclusive of today, so "30 days" really is thirty rows on a daily trend.
    case "30d":
      return { from: shiftDays(today, -29), to: today };
    case "90d":
      return { from: shiftDays(today, -89), to: today };
    case "fy":
      return { from: `${fyStartYear(today)}-04-01`, to: today };
    case "lastfy": {
      const y = fyStartYear(today) - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case "all":
      return { from: earliest && earliest < today ? earliest : today, to: today };
  }
}

/** Which pill an explicit from/to pair corresponds to, or null when the dates
 * are a genuinely custom window. Lets a shared link light the right pill. */
export function matchPreset(
  from: string,
  to: string,
  earliest: string | null,
  today: string = istDateString(),
): PeriodKey | null {
  for (const { key } of PERIOD_PRESETS) {
    const b = periodBounds(key, today, earliest);
    if (b.from === from && b.to === to) return key;
  }
  return null;
}
