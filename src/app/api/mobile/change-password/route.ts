import { changeOwnPassword } from "@/lib/auth/password-actions";
import { requireIsr } from "@/lib/mobile/auth";

/**
 * Change the signed-in ISR's password — the same `changeOwnPassword` the
 * website's change-password page uses, so the length policy, "must differ from
 * the current one", clearing `mustChangePassword` and the audit row all match.
 *
 * Body: { currentPassword, newPassword, confirmPassword } → 200 { ok: true } | 400 { error }
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const { currentPassword, newPassword, confirmPassword } = body ?? {};
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return Response.json({ error: "Fill in all three password fields." }, { status: 400 });
  }

  const result = await changeOwnPassword({ currentPassword, newPassword, confirmPassword });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
