import { requireIsr } from "@/lib/mobile/auth";
import { getNewCounterForm } from "@/lib/mobile/new-counter";

/** What the New Counter wizard needs: the ISR's stockist, C&F, areas and the
 * counter types, or why they can't add one yet. */
export async function GET() {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;
  return Response.json(await getNewCounterForm(auth.user));
}
