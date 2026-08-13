import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bugReports, users, type BugStatus, type BugType } from "@/db/schema";
import { formatISTDate, formatISTTime } from "@/lib/date";

export type BugNotification = {
  id: string;
  type: BugType;
  title: string;
  status: BugStatus;
  /** Who filed it — only shown to admins (others only see their own). */
  reporterName: string | null;
  whenLabel: string;
};

export type BugInbox = {
  /** Items still needing attention — what the bell badge counts. */
  count: number;
  items: BugNotification[];
  /** Admins triage everyone's reports; everyone else only tracks their own. */
  isTriage: boolean;
};

const FEED_LIMIT = 8;

/** Statuses that still "need attention" for each audience. */
const TRIAGE_ACTIVE: BugStatus[] = ["open", "in_progress"];
const REPORTER_ACTIVE: BugStatus[] = ["open", "in_progress"];

/**
 * Bug-report inbox for the top-bar bell.
 *
 * - Admin sees every report awaiting triage (that's where reports are sent).
 * - Everyone else sees only the reports they filed, so they can follow the
 *   outcome without being shown other people's issues.
 *
 * The badge counts genuinely-active items rather than pretending to track
 * "unread" — there's no per-user read state, and a number that never settles
 * would be worse than none.
 */
export async function getBugInbox(user: {
  id: string;
  accessRoles: readonly string[];
}): Promise<BugInbox> {
  const isTriage = user.accessRoles.includes("admin");
  const reporter = alias(users, "bug_reporter");

  const scope = isTriage
    ? inArray(bugReports.status, TRIAGE_ACTIVE)
    : eq(bugReports.reportedByUserId, user.id);

  const rows = await db
    .select({
      id: bugReports.id,
      type: bugReports.type,
      title: bugReports.title,
      status: bugReports.status,
      createdAt: bugReports.createdAt,
      reporterName: reporter.name,
    })
    .from(bugReports)
    .leftJoin(reporter, eq(reporter.id, bugReports.reportedByUserId))
    .where(scope)
    .orderBy(desc(bugReports.createdAt))
    .limit(FEED_LIMIT);

  // Count the full active set, not just the page we display.
  const countRows = await db
    .select({ id: bugReports.id })
    .from(bugReports)
    .where(
      isTriage
        ? inArray(bugReports.status, TRIAGE_ACTIVE)
        : and(eq(bugReports.reportedByUserId, user.id), inArray(bugReports.status, REPORTER_ACTIVE)),
    );

  return {
    isTriage,
    count: countRows.length,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      status: r.status,
      reporterName: isTriage ? r.reporterName : null,
      whenLabel: `${formatISTDate(r.createdAt)} · ${formatISTTime(r.createdAt)}`,
    })),
  };
}
