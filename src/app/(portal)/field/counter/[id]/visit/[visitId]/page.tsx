import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getVisitForEdit } from "@/lib/field/visit-actions";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { Notice } from "@/components/ui/notice";
import { VisitForm } from "../visit-form";

export default async function EditVisitPage({
  params,
}: {
  params: Promise<{ id: string; visitId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="Edit visit">You don&apos;t have Field Salesman ISR access.</Notice>;
  }

  const { id, visitId } = await params;
  const visit = await getVisitForEdit(visitId);
  if (!visit || visit.counterId !== id) {
    return (
      <Notice title="Edit visit">
        This visit can&apos;t be edited — it&apos;s either not yours or the day it
        was recorded on has ended.
      </Notice>
    );
  }

  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      typeOther: counters.typeOther,
      areaName: areas.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  return (
    <VisitForm
      counterId={counter.id}
      counterName={counter.name}
      counterArea={`${counterTypeLabel(counter.type, counter.typeOther)} · ${counter.areaName}`}
      visitId={visitId}
      initial={{
        items: visit.items,
        rank: visit.rank,
        competitor: visit.competitor,
        competitorBrand: visit.competitorBrand,
        remarks: visit.remarks,
      }}
    />
  );
}
