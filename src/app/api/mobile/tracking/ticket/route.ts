import { requireIsr } from "@/lib/mobile/auth";
import { issueRepTicket } from "@/lib/tracking/actions";

/**
 * A short-lived ticket for the realtime location service — the website's own
 * `issueRepTicket`, so tracking is only possible while today's day is open and
 * only from the phone that started it.
 *
 * Body: { deviceId } → 200 { ok: true, ticket } | 200 { ok: false, error, code? }
 * (200 either way: "not on the clock" is a normal answer, not a failure.)
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : undefined;
  return Response.json(await issueRepTicket(deviceId));
}
