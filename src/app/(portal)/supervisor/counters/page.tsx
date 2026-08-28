import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeStockists } from "@/lib/supervisor/team";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CountersListClient, type CounterListRow } from "@/app/(portal)/_components/counters-list";

/** Safety cap — an SO might supervise several stockists, so this list can be
 * longer than the ISR's, but still needs a ceiling. */
const MAX_ROWS = 2000;

export default async function SupervisorCountersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("All Counters")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  // Scope: every depot this SO supervises (admin bypasses via getScopeStockists).
  const scopeStockists = await getScopeStockists(user);
  if (scopeStockists.length === 0) {
    return (
      <Notice title={t("All Counters")}>
        {t("You don't supervise any stockists yet.")}
      </Notice>
    );
  }
  const stockistIds = scopeStockists.map((d) => d.id);

  const counterRows = await db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      typeOther: counters.typeOther,
      areaId: counters.areaId,
      areaName: areas.name,
      stockistId: counters.stockistId,
      stockistName: stockists.name,
      status: counters.status,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(inArray(counters.stockistId, stockistIds))
    .orderBy(asc(counters.name))
    .limit(MAX_ROWS);

  const rows: CounterListRow[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    type: counterTypeLabel(c.type, c.typeOther),
    areaId: c.areaId,
    areaName: c.areaName,
    stockistId: c.stockistId,
    stockistName: c.stockistName,
    status: c.status,
    // Supervisors don't check in themselves (that's the ISR's job) — the
    // client won't render the button anyway with showCheckIn=false, but keep
    // the flag honest in case the shape ever grows another consumer.
    canVisit: false,
    visitedToday: false,
  }));

  const areasInScope = Array.from(
    new Map(counterRows.map((c) => [c.areaId, c.areaName])).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const depotsInScope = Array.from(
    new Map(counterRows.map((c) => [c.stockistId, c.stockistName])).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Title reflects the scope: one depot names it, several is "your stockists".
  const scopeSuffix =
    scopeStockists.length === 1 ? ` — ${scopeStockists[0].name}` : ` — ${t("your stockists")}`;

  return (
    <CountersListClient
      rows={rows}
      areas={areasInScope}
      stockists={depotsInScope}
      title={t("All Counters") + scopeSuffix}
      subtitle={t("Every counter in the stockists you supervise — view only.")}
      truncated={counterRows.length >= MAX_ROWS}
      maxRows={MAX_ROWS}
      showCheckIn={false}
    />
  );
}
