import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { EditCounterForm } from "./edit-form";

export default async function EditCounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("Edit counter")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }

  const { id } = await params;
  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      address: counters.address,
      type: counters.type,
      typeOther: counters.typeOther,
      areaId: counters.areaId,
      stockistId: counters.stockistId,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(counters)
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const isAdmin = user.accessRoles.includes("admin");
  const canEdit = isAdmin || counter.stockistId === user.depot?.id;
  if (!canEdit) {
    const t = await getT();
    return (
      <Notice title={t("Edit counter")}>
        {t("This counter isn't at your stockist, so you can't edit it.")}
      </Notice>
    );
  }

  const depotAreas = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(eq(areas.stockistId, counter.stockistId))
    .orderBy(asc(areas.name));

  return (
    <EditCounterForm
      counterId={counter.id}
      areaOptions={depotAreas}
      initial={{
        name: counter.name,
        address: counter.address ?? "",
        type: counter.type,
        typeOther: counter.typeOther ?? "",
        areaId: counter.areaId,
        gps: counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : "",
      }}
    />
  );
}
