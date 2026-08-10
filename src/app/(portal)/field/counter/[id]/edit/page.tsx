import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
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
    return <Notice title="Edit counter">You don&apos;t have Field Salesman access.</Notice>;
  }

  const { id } = await params;
  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      address: counters.address,
      type: counters.type,
      areaId: counters.areaId,
      depotId: counters.depotId,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(counters)
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const canEdit = user.accessRoles.includes("admin") || counter.depotId === user.depot?.id;
  if (!canEdit) {
    return (
      <Notice title="Edit counter">
        This counter isn&apos;t in your depot, so you can&apos;t edit it.
      </Notice>
    );
  }

  const depotAreas = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(eq(areas.depotId, counter.depotId))
    .orderBy(asc(areas.name));

  return (
    <EditCounterForm
      counterId={counter.id}
      areaOptions={depotAreas}
      initial={{
        name: counter.name,
        address: counter.address ?? "",
        type: counter.type,
        areaId: counter.areaId,
        gps: counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : "",
      }}
    />
  );
}
