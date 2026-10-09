import { endDay } from "@/lib/field/day-log-actions";
import { requireIsr } from "@/lib/mobile/auth";
import { getMobileDayLog, qtyFromBody } from "@/lib/mobile/day-log";

/**
 * End today's day — the website's own `endDay` ("start your day first",
 * once-a-day, audit row).
 *
 * Body: { remaining: { DG10, DG20, DB20, DB40 } } → 200 the updated Day Log
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);

  const result = await endDay(qtyFromBody(body?.remaining));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(await getMobileDayLog(auth.user.id));
}
