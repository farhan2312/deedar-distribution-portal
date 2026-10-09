import { requestPasswordReset } from "@/lib/auth/reset-actions";

/**
 * "I've forgotten my password" from the app — the website's own
 * `requestPasswordReset`, so it only queues a request for an admin (it never
 * changes a password) and the same per-number and per-address limits apply.
 * No session, by necessity: the caller can't sign in.
 *
 * Body: { phone } → 200 { ok: true } | 400 { error }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone : "";

  const result = await requestPasswordReset(phone);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
