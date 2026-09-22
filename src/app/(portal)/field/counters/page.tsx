import { redirect } from "next/navigation";
import { and, eq, gte, lt } from "drizzle-orm";
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

  const { start, end } = istDayBounds();

  // The rep's own visits for today come along beside the list rather than
  // after it. It used to be bounded by the page's counter ids, which meant
  // waiting for the page first; a rep's day is a handful of rows either way.
  //
  // ISR → their own stockist; admin → every counter.
  const [list, seen] = await Promise.all([
    fetchCountersList({
      scopeStockistIds: user.depot ? [user.depot.id] : null,
      params: await searchParams,
    }),
    isAdmin
      ? Promise.resolve([] as { counterId: string }[])
      : db
          .select({ counterId: visits.counterId })
          .from(visits)
          .where(
            and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end)),
          ),
  ]);
  const visitedToday = new Set(seen.map((v) => v.counterId));

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
