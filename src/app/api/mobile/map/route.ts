import { requireIsr } from "@/lib/mobile/auth";
import { getMobileMap } from "@/lib/mobile/map";

/** Live map data: counters to plot, area picker, tile server.
 * GET ?area=<areaId> (admins may also pass cnf / depot) */
export async function GET(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const search = new URL(request.url).searchParams;
  return Response.json(
    await getMobileMap(auth.user, {
      cnf: search.get("cnf") ?? undefined,
      depot: search.get("depot") ?? undefined,
      area: search.get("area") ?? undefined,
    }),
  );
}
