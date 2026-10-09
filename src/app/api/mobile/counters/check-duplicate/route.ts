import { checkDuplicate } from "@/lib/field/actions";
import { requireIsr } from "@/lib/mobile/auth";

/**
 * Is this mobile already a counter? — the website's `checkDuplicate`, so a
 * match at the ISR's stockist comes back with its id (to add a visit instead)
 * and one elsewhere with `canVisit: false`.
 *
 * GET ?phone=9876543210 → { match: FieldDuplicateMatch }
 */
export async function GET(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const phone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  return Response.json({ match: await checkDuplicate(phone) });
}
