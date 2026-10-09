import type { BugSeverity, BugType } from "@/db/schema";
import { submitBugReport } from "@/lib/bugs/actions";
import { requireIsr } from "@/lib/mobile/auth";

/**
 * File a bug report or feature request from the app — the website's own
 * `submitBugReport`, so it lands in the admin's Bug Tracker with the same
 * validation (title, type, severity, screenshot must be an image data URL
 * under the size cap) and audit row.
 *
 * Body: { type: "bug" | "feature", title, description, severity, page, screenshot?: "data:image/…" }
 * → 201 | 400 { error }
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const result = await submitBugReport({
    type: str(body?.type) as BugType,
    title: str(body?.title),
    description: str(body?.description),
    severity: str(body?.severity) as BugSeverity,
    // Which app screen it came from, marked so the admin can tell it from a
    // website page.
    page: `Android app · ${str(body?.page) || "unknown screen"}`,
    screenshot: str(body?.screenshot) || null,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true }, { status: 201 });
}
