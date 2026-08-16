import { redirect } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { getScopeDepots } from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { NewCounterWizard } from "../../field/new-counter/wizard";

// A Supervisor can add counters (in any depot they supervise) but never record
// visits — that stays a field-rep action. Reuses the field counter wizard in
// "open" mode, scoped to the SO's supervised depots.
export default async function SupervisorNewCounterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("New Counter")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const depotOptions = await getScopeDepots(user);
  if (depotOptions.length === 0) {
    const t = await getT();
    return <Notice title={t("New Counter")}>{t("You don't supervise any depots yet.")}</Notice>;
  }
  const depotIds = depotOptions.map((d) => d.id);

  const [depotRows, areaRows] = await Promise.all([
    db.select().from(depots).where(inArray(depots.id, depotIds)).orderBy(asc(depots.name)),
    db.select().from(areas).where(inArray(areas.depotId, depotIds)).orderBy(asc(areas.name)),
  ]);
  const cnfIds = [...new Set(depotRows.map((d) => d.cnfId))];
  const cnfRows = cnfIds.length
    ? await db.select().from(cnfs).where(inArray(cnfs.id, cnfIds)).orderBy(asc(cnfs.name))
    : [];

  return (
    <NewCounterWizard
      variant="supervisor"
      mode="open"
      cnfs={cnfRows.map((c) => ({ id: c.id, name: c.name }))}
      depots={depotRows.map((d) => ({
        id: d.id,
        name: d.name,
        cnfId: d.cnfId,
        areas: areaRows.filter((a) => a.depotId === d.id).map((a) => ({ id: a.id, name: a.name })),
      }))}
    />
  );
}
