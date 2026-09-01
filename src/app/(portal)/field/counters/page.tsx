import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDayBounds } from "@/lib/date";
import { fetchCountersList, type CountersListParams } from "@/lib/counters/list";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CountersListClient, type CounterListRow } from "@/app/(portal)/_components/counters-list";

export default async function FieldCountersPage({
  searchParams,
}: {
  searchParams: Promise<CountersListParams>;
}) {
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

  // ISR → their own stockist; admin → every counter.
  const list = await fetchCountersList({
    scopeStockistIds: user.depot ? [user.depot.id] : null,
    params: await searchParams,
  });

  // Only this page's counters need the "visited today" flag, so the lookup is
  // bounded by the page rather than by the rep's whole day.
  const pageIds = list.rows.map((r) => r.id);
  let visitedToday = new Set<string>();
  if (!isAdmin && pageIds.length > 0) {
    const { start, end } = istDayBounds();
    const seen = await db
      .select({ counterId: visits.counterId })
      .from(visits)
      .where(
        and(
          eq(visits.userId, user.id),
          inArray(visits.counterId, pageIds),
          gte(visits.visitedAt, start),
          lt(visits.visitedAt, end),
        ),
      );
    visitedToday = new Set(seen.map((v) => v.counterId));
  }

  const rows: CounterListRow[] = list.rows.map((c) => ({
    ...c,
    canVisit: isAdmin || c.stockistId === user.depot?.id,
    visitedToday: visitedToday.has(c.id),
  }));

  return (
    <CountersListClient
      rows={rows}
      areaOptions={list.areaOptions}
      stockistOptions={list.stockistOptions}
      filters={list.filters}
      total={list.total}
      page={list.page}
      totalPages={list.totalPages}
      pageSize={list.pageSize}
      scope={user.depot?.name ?? t("Your stockist")}
      showCheckIn={true}
    />
  );
}
