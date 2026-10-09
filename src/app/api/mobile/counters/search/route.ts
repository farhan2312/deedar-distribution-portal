import { searchCounterByPhone } from "@/lib/field/actions";
import { requireIsr } from "@/lib/mobile/auth";

/**
 * Find a counter by its 10-digit mobile — the website's `searchCounterByPhone`,
 * so a counter at another stockist only confirms the number is taken.
 *
 * GET ?phone=9876543210 → CounterSearchResult
 */
export async function GET(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const phone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  return Response.json(await searchCounterByPhone(phone));
}
