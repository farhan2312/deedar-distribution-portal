import { alias } from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bugReports, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { BugTracker, type BugRow } from "./bug-tracker";

export default async function BugTrackerPage() {
  await requireAdmin();

  const reporter = alias(users, "reporter");
  // Note: `screenshot` is intentionally NOT selected — it can be ~1MB per row.
  // The client fetches it on demand via getBugScreenshot().
  const rows = await db
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
    .orderBy(desc(bugReports.createdAt))
    .limit(200);

  const reports: BugRow[] = rows.map((r) => ({
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
  }));

  return <BugTracker reports={reports} />;
}
