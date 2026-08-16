import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { VisitForm } from "./visit-form";

export default async function NewVisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("Add visit")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }

  const { id } = await params;
  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      typeOther: counters.typeOther,
      areaName: areas.name,
      depotId: counters.depotId,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const canVisit = user.accessRoles.includes("admin") || counter.depotId === user.depot?.id;
  if (!canVisit) {
    const t = await getT();
    return (
      <Notice title={t("Add visit")}>
        {t("This counter isn't in your depot, so you can't add a visit to it.")}
      </Notice>
    );
  }

  return (
    <VisitForm
      counterId={counter.id}
      counterName={counter.name}
      counterArea={`${counterTypeLabel(counter.type, counter.typeOther)} · ${counter.areaName}`}
    />
  );
}
