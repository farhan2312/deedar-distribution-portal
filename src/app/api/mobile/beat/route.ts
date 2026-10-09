import { requireIsr } from "@/lib/mobile/auth";
import { getMobileBeat } from "@/lib/mobile/beat";

/** Today's Beat: the counters assigned for today, with visited status. */
export async function GET() {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;
  return Response.json(await getMobileBeat(auth.user));
}
