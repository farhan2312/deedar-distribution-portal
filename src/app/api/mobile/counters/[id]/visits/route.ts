import { createVisit } from "@/lib/field/visit-actions";
import { requireIsr } from "@/lib/mobile/auth";
import { isUuid, visitInputFromBody } from "@/lib/mobile/visits";

/**
 * Record a visit — the website's own `createVisit`, so validation, the
 * started-day gate, own-stockist check and the once-a-day rule all match.
 *
 * Body: { items: [{ segment, stock, sold }], rank, competitor, competitorBrand, remarks, durationSeconds }
 * → 201 { visitId } | 400/409 { error, existingVisitId?, blockedByName? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Counter not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await createVisit(id, visitInputFromBody(body));
  if (!result.ok) {
    const { error, existingVisitId, blockedByName } = result;
    // 409 when today's visit already exists — the app opens it for editing
    // (own) or explains who got there first (colleague).
    const conflict = !!(existingVisitId || blockedByName);
    return Response.json({ error, existingVisitId, blockedByName }, { status: conflict ? 409 : 400 });
  }
  return Response.json({ visitId: result.visitId }, { status: 201 });
}
