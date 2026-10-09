import { startDay } from "@/lib/field/day-log-actions";
import { requireIsr } from "@/lib/mobile/auth";
import { getMobileDayLog, qtyFromBody } from "@/lib/mobile/day-log";

/**
 * Start today's day — the website's own `startDay`, so the once-a-day rule,
 * tracking-device ownership and the audit row are identical.
 *
 * Body: { deviceId, pickup: { DG10, DG20, DB20, DB40 } } → 200 the updated Day Log
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : undefined;

  const result = await startDay(deviceId, qtyFromBody(body?.pickup));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(await getMobileDayLog(auth.user.id));
}
