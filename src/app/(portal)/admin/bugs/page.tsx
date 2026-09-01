import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bugReports,
  bugSeverityEnum,
  bugStatusEnum,
  bugTypeEnum,
  users,
  type BugSeverity,
  type BugStatus,
  type BugType,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { BugBoard, type BugFilters, type BugRow, type BugStats } from "./bug-tracker";

/** Cards fetched per column. The header shows the true count either way, so a
 * busy column says "50 of 214" rather than quietly stopping at 50. */
const PER_COLUMN = 50;

type Params = { type?: string; severity?: string; q?: string };

export default async function BugTrackerPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const type = bugTypeEnum.enumValues.includes(params.type as BugType)
    ? (params.type as BugType)
    : null;
  const severity = bugSeverityEnum.enumValues.includes(params.severity as BugSeverity)
    ? (params.severity as BugSeverity)
    : null;
  const q = (params.q ?? "").trim();

  /** The filter, applied to the columns but never to the summary cards. */
  const where = (): SQL | undefined => {
    const parts: SQL[] = [];
    if (type) parts.push(eq(bugReports.type, type));
    if (severity) parts.push(eq(bugReports.severity, severity));
    if (q) {
      const like = `%${q}%`;
      parts.push(or(ilike(bugReports.title, like), ilike(bugReports.description, like))!);
    }
    return parts.length ? and(...parts) : undefined;
  };

  const reporter = alias(users, "reporter");

  /**
   * One query per column rather than one capped query for the board.
   *
   * A single `LIMIT 200` over everything lets one busy status crowd the others
   * out — 200 open bugs and the Resolved column renders empty despite having
   * rows. Four small indexed reads keep every column populated.
   *
   * `screenshot` is deliberately not selected: it can be ~1MB per row, and the
   * client fetches it on demand via `getBugScreenshot()`.
   */
  const columnQuery = (status: BugStatus) => {
    const f = where();
    return db
      .select({
        id: bugReports.id,
        type: bugReports.type,
        title: bugReports.title,
        description: bugReports.description,
        severity: bugReports.severity,
        page: bugReports.page,
        status: bugReports.status,
        createdAt: bugReports.createdAt,
        reporterName: reporter.name,
        hasScreenshot: sql<boolean>`${bugReports.screenshot} IS NOT NULL`,
      })
      .from(bugReports)
      .leftJoin(reporter, eq(reporter.id, bugReports.reportedByUserId))
      .where(f ? and(eq(bugReports.status, status), f) : eq(bugReports.status, status))
      // Two reports filed in the same second would otherwise straddle the cap
      // unpredictably; the id makes the sort total.
      .orderBy(desc(bugReports.createdAt), asc(bugReports.id))
      .limit(PER_COLUMN);
  };

  const statuses = bugStatusEnum.enumValues;
  const [[statRow], countRows, ...columnRows] = await Promise.all([
    // Summary cards read the whole tracker, unfiltered: they answer "how big
    // is the backlog", which a filter shouldn't rewrite. One pass with
    // FILTER clauses rather than six round-trips.
    db
      .select({
        total: sql<number>`count(*)::int`,
        bugs: sql<number>`count(*) filter (where ${bugReports.type} = 'bug')::int`,
        features: sql<number>`count(*) filter (where ${bugReports.type} = 'feature')::int`,
        open: sql<number>`count(*) filter (where ${bugReports.status} = 'open')::int`,
        inProgress: sql<number>`count(*) filter (where ${bugReports.status} = 'in_progress')::int`,
        resolved: sql<number>`count(*) filter (where ${bugReports.status} = 'resolved')::int`,
        closed: sql<number>`count(*) filter (where ${bugReports.status} = 'closed')::int`,
        // Critical work still outstanding — the one number worth acting on.
        criticalOpen: sql<number>`count(*) filter (
          where ${bugReports.severity} = 'critical'
            and ${bugReports.status} in ('open', 'in_progress')
        )::int`,
      })
      .from(bugReports),
    // Column headers count what the filter admits, so they match their cards.
    db
      .select({ status: bugReports.status, n: sql<number>`count(*)::int` })
      .from(bugReports)
      .where(where())
      .groupBy(bugReports.status),
    ...statuses.map(columnQuery),
  ]);

  const totals = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<BugStatus, number>;
  for (const r of countRows) totals[r.status] = r.n;

  const cards = Object.fromEntries(
    statuses.map((s, i) => [
      s,
      columnRows[i].map(
        (r): BugRow => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          severity: r.severity,
          page: r.page,
          status: r.status,
          reporterName: r.reporterName,
          whenLabel: `${formatISTDate(r.createdAt)} · ${formatISTTime(r.createdAt)}`,
          hasScreenshot: !!r.hasScreenshot,
        }),
      ),
    ]),
  ) as Record<BugStatus, BugRow[]>;

  const stats: BugStats = statRow ?? {
    total: 0,
    bugs: 0,
    features: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    criticalOpen: 0,
  };
  const filters: BugFilters = { type, severity, q };

  return (
    <BugBoard
      cards={cards}
      totals={totals}
      perColumn={PER_COLUMN}
      stats={stats}
      filters={filters}
    />
  );
}
