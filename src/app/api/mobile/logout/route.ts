import { recordAudit } from "@/lib/audit/record";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Records the ISR signing out of the app. The app discards its token itself;
 * this is only so the audit log shows the sign-out, matching `logoutAction`
 * on the website — including skipping the row when there is no live session.
 */
export async function POST() {
  if (await getCurrentUser()) {
    await recordAudit({ action: "logout", module: "auth", summary: "Signed out" });
  }
  return Response.json({ ok: true });
}
