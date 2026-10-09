import { requireIsr } from "@/lib/mobile/auth";
import { getMobileDayLog } from "@/lib/mobile/day-log";

/** The ISR's Day Log: today's start/end and stock, this week, previous days. */
export async function GET() {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;
  return Response.json(await getMobileDayLog(auth.user.id));
}
