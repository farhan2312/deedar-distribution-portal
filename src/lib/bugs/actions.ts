"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bugReports,
  bugSeverityEnum,
  bugStatusEnum,
  bugTypeEnum,
  type BugSeverity,
  type BugStatus,
  type BugType,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { requireAdmin } from "@/lib/admin/guard";
import { MAX_SCREENSHOT_CHARS } from "./constants";
import { getBugInbox, type BugInbox } from "./notifications";

export type BugReportInput = {
  type: BugType;
  title: string;
  description: string;
  severity: BugSeverity;
  page: string;
  /** data: URL, or null. */
  screenshot: string | null;
};

type Result = { ok: true } | { ok: false; error: string };

/** File a bug/feature report. Any signed-in user may report. */
export async function submitBugReport(input: BugReportInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a short title." };
  if (title.length > 200) return { ok: false, error: "Title is too long." };
  if (!bugTypeEnum.enumValues.includes(input.type)) {
    return { ok: false, error: "Pick Bug or Feature." };
  }
  if (!bugSeverityEnum.enumValues.includes(input.severity)) {
    return { ok: false, error: "Pick a severity." };
  }

  const screenshot = input.screenshot?.trim() || null;
  if (screenshot) {
    if (!screenshot.startsWith("data:image/")) {
      return { ok: false, error: "Screenshot must be an image." };
    }
    if (screenshot.length > MAX_SCREENSHOT_CHARS) {
      return { ok: false, error: "Screenshot is too large — keep it under ~1MB." };
    }
  }

  await db.insert(bugReports).values({
    type: input.type,
    title,
    description: input.description.trim() || null,
    severity: input.severity,
    page: input.page.trim().slice(0, 300) || null,
    screenshot,
    reportedByUserId: user.id,
  });

  revalidatePath("/admin/bugs");
  return { ok: true };
}

/** Admin: move a report through triage. */
export async function setBugStatus(id: string, status: BugStatus): Promise<Result> {
  await requireAdmin();
  if (!bugStatusEnum.enumValues.includes(status)) {
    return { ok: false, error: "Unknown status." };
  }
  await db
    .update(bugReports)
    .set({ status, updatedAt: new Date() })
    .where(eq(bugReports.id, id));
  revalidatePath("/admin/bugs");
  return { ok: true };
}

/** Re-read the current user's bug inbox (top-bar bell) without a page reload. */
export async function fetchBugInbox(): Promise<BugInbox | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return getBugInbox(user);
}

/** Admin: fetch one report's screenshot on demand — list queries deliberately
 * omit the column so a page of reports stays small. */
export async function getBugScreenshot(id: string): Promise<string | null> {
  await requireAdmin();
  const [row] = await db
    .select({ screenshot: bugReports.screenshot })
    .from(bugReports)
    .where(eq(bugReports.id, id))
    .limit(1);
  return row?.screenshot ?? null;
}
