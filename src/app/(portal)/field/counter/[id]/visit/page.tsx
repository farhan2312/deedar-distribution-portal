import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
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
    return <Notice title="Add visit">You don&apos;t have Field Salesman ISR access.</Notice>;
  }

  const { id } = await params;
  const [counter] = await db
    .select({ id: counters.id, name: counters.name, type: counters.type, areaName: areas.name, depotId: counters.depotId })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const canVisit = user.accessRoles.includes("admin") || counter.depotId === user.depot?.id;
  if (!canVisit) {
    return (
      <Notice title="Add visit">
        This counter isn&apos;t in your depot, so you can&apos;t add a visit to it.
      </Notice>
    );
  }

  return (
    <VisitForm
      counterId={counter.id}
      counterName={counter.name}
      counterArea={`${counter.type} · ${counter.areaName}`}
    />
  );
}
