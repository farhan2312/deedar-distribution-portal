// All field-facing "today" logic runs in India Standard Time (Asia/Kolkata,
// fixed UTC+5:30, no DST). Timestamps are stored in the DB as UTC (timestamptz);
// these helpers convert to/from the IST calendar day for queries and display.

const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current IST calendar day as "YYYY-MM-DD" (used as day_logs.log_date). */
export function istDateString(instant: Date = new Date()): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * UTC instants for the start (inclusive) and end (exclusive) of the IST
 * calendar day that `instant` falls in — for `visited_at >= start AND < end`.
 */
export function istDayBounds(instant: Date = new Date()): { start: Date; end: Date } {
  const dateStr = istDateString(instant);
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** "09:12 AM" in IST. */
export function formatISTTime(instant: Date | null | undefined): string {
  if (!instant) return "—";
  return instant.toLocaleTimeString("en-US", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Thu, 8 Aug 2026" in IST. */
export function formatISTDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(`${value}T00:00:00+05:30`) : value;
  return d.toLocaleDateString("en-US", {
    timeZone: IST_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Friday, 8 Aug 2026" in IST (long weekday) for the day-log header. */
export function formatISTDateLong(instant: Date = new Date()): string {
  return instant.toLocaleDateString("en-US", {
    timeZone: IST_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * `count` consecutive IST calendar days starting at `from` (default today),
 * as "YYYY-MM-DD". Lives here so callers don't read the clock inline — doing
 * that inside a component body trips react-hooks/purity.
 */
export function istDateRange(count: number, from: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, i) =>
    istDateString(new Date(from.getTime() + i * 24 * 60 * 60 * 1000)),
  );
}

/** Time-of-day greeting based on the current IST hour. */
export function istGreeting(instant: Date = new Date()): string {
  const h = new Date(instant.getTime() + IST_OFFSET_MS).getUTCHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Duration between two instants as "8h 36m" (0 if either missing). */
export function durationLabel(start: Date | null, end: Date | null): string {
  if (!start || !end) return "—";
  let mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins < 0) mins = 0;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
