import { redirect } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, stockists } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { getScopeStockists } from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { NewCounterWizard } from "../../field/new-counter/wizard";

// A Supervisor can add counters (in any depot they supervise) but never record
// visits — that stays a field-rep action. Reuses the field counter wizard in
// "open" mode, scoped to the SO's supervised stockists.
export default async function SupervisorNewCounterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("New Counter")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const depotOptions = await getScopeStockists(user);
  if (depotOptions.length === 0) {
    const t = await getT();
    return <Notice title={t("New Counter")}>{t("You don't supervise any stockists yet.")}</Notice>;
  }
  const stockistIds = depotOptions.map((d) => d.id);

  const [stockistRows, areaRows] = await Promise.all([
    db.select().from(stockists).where(inArray(stockists.id, stockistIds)).orderBy(asc(stockists.name)),
    db.select().from(areas).where(inArray(areas.stockistId, stockistIds)).orderBy(asc(areas.name)),
  ]);
  const cnfIds = [...new Set(stockistRows.map((d) => d.cnfId))];
  const cnfRows = cnfIds.length
    ? await db.select().from(cnfs).where(inArray(cnfs.id, cnfIds)).orderBy(asc(cnfs.name))
    : [];

  return (
    <NewCounterWizard
      variant="supervisor"
      mode="open"
      cnfs={cnfRows.map((c) => ({ id: c.id, name: c.name }))}
      stockists={stockistRows.map((d) => ({
        id: d.id,
        name: d.name,
        cnfId: d.cnfId,
        areas: areaRows.filter((a) => a.stockistId === d.id).map((a) => ({ id: a.id, name: a.name })),
      }))}
    />
  );
}
