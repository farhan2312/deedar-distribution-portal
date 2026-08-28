import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CountersListClient, type CounterListRow } from "@/app/(portal)/_components/counters-list";

/** Safety cap — a normal depot holds hundreds of counters, not thousands. */
const MAX_ROWS = 1000;

export default async function FieldCountersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "field")) {
    return <Notice title={t("All Counters")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    return (
      <Notice title={t("All Counters")}>
        {t("You aren't assigned to a stockist yet — ask your Sales Officer to map you to one.")}
      </Notice>
    );
  }

  // ISR → their own depot; admin → all counters (bounded).
  const depotFilter = user.depot ? eq(counters.stockistId, user.depot.id) : undefined;

  const [counterRows, todaysVisitRows] = await Promise.all([
    db
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
      .where(depotFilter)
      .orderBy(asc(counters.name))
      .limit(MAX_ROWS),
    // ISR's own visits today — colours rows. Admin gets an empty set.
    isAdmin
      ? Promise.resolve([] as { counterId: string }[])
      : (() => {
          const { start, end } = istDayBounds();
          return db
            .select({ counterId: visits.counterId })
            .from(visits)
            .where(
              and(
                eq(visits.userId, user.id),
                gte(visits.visitedAt, start),
                lt(visits.visitedAt, end),
              ),
            );
        })(),
  ]);

  const visitedToday = new Set(todaysVisitRows.map((v) => v.counterId));

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
    canVisit: isAdmin || c.stockistId === user.depot?.id,
    visitedToday: visitedToday.has(c.id),
  }));

  // Filter option lists — derived from what's actually in the returned data.
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

  const title =
    t("All Counters") + (user.depot ? ` — ${user.depot.name}` : "");

  return (
    <CountersListClient
      rows={rows}
      areas={areasInScope}
      stockists={depotsInScope}
      title={title}
      subtitle={t("Every counter at your stockist — tap Check in to open its page.")}
      truncated={counterRows.length >= MAX_ROWS}
      maxRows={MAX_ROWS}
      showCheckIn={true}
    />
  );
}
