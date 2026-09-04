/**
 * The audit log's period pills.
 *
 * Deliberately not the dashboards' `PeriodFilter`. That control exists to
 * compare a business period against the one before it — financial years,
 * month-over-month, a hand-picked span. A log is read by recency: "today",
 * "this week", "this month", "everything". Four pills answer that, and the
 * calendars and FY presets would only be noise on a screen nobody reads to
 * compare quarters.
 *
 * Client-safe: the pill row and the server window derive from the same list.
 */

export type AuditPeriod = "today" | "7d" | "30d" | "all";

export const AUDIT_PERIODS: readonly { key: AuditPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All" },
];

export function isAuditPeriod(v: string | undefined): v is AuditPeriod {
  return !!v && AUDIT_PERIODS.some((p) => p.key === v);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window a period covers, as a UTC `[start, end)` pair.
 *
 * "Today" is the IST calendar day, not the last 24 hours — a log read at 9am
 * should show this morning, not half of yesterday. The multi-day windows are
 * rolling from now, which is what "last 7 days" means to the person asking.
 */
export function auditWindow(period: AuditPeriod, now: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(now.getTime() + DAY_MS);
  switch (period) {
    case "today": {
      // IST midnight is 18:30 UTC the previous day.
      const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const day = ist.toISOString().slice(0, 10);
      return { start: new Date(`${day}T00:00:00+05:30`), end };
    }
    case "7d":
      return { start: new Date(now.getTime() - 7 * DAY_MS), end };
    case "30d":
      return { start: new Date(now.getTime() - 30 * DAY_MS), end };
    case "all":
      // Before this system existed, so every row qualifies.
      return { start: new Date(0), end };
  }
}
