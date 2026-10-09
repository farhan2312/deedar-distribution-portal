import { getVisitForEdit, updateVisit } from "@/lib/field/visit-actions";
import { requireIsr } from "@/lib/mobile/auth";
import { getCounterHeader, isUuid, visitInputFromBody, VISIT_FORM_OPTIONS } from "@/lib/mobile/visits";

const NOT_EDITABLE =
  "This visit can't be edited — it's either not yours or the day it was recorded on has ended.";

/** A visit for the edit form — `getVisitForEdit`, so only the ISR's own visit,
 * and only until midnight. */
export async function GET(_request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const { visitId } = await params;
  const visit = isUuid(visitId) ? await getVisitForEdit(visitId) : null;
  if (!visit) return Response.json({ error: NOT_EDITABLE }, { status: 404 });

  const counter = await getCounterHeader(visit.counterId);
  if (!counter) return Response.json({ error: "Counter not found." }, { status: 404 });

  return Response.json({ visit, counter, options: VISIT_FORM_OPTIONS });
}

/** Save changes — the website's own `updateVisit` (owner only, midnight lock). */
export async function PATCH(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const { visitId } = await params;
  if (!isUuid(visitId)) return Response.json({ error: NOT_EDITABLE }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await updateVisit(visitId, visitInputFromBody(body));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ visitId: result.visitId });
}
