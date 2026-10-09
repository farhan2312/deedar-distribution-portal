import { requireIsr } from "@/lib/mobile/auth";
import { getMobileCounter, isUuid, VISIT_FORM_OPTIONS } from "@/lib/mobile/visits";

/** The counter page: details, today's visit status, editable visit history. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const data = isUuid(id) ? await getMobileCounter(auth.user, id) : null;
  if (!data) return Response.json({ error: "Counter not found." }, { status: 404 });
  return Response.json({ ...data, options: VISIT_FORM_OPTIONS });
}
