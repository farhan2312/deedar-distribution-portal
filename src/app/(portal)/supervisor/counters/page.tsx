import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeStockists } from "@/lib/supervisor/team";
import { fetchCountersList, type CountersListParams } from "@/lib/counters/list";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CountersListClient, type CounterListRow } from "@/app/(portal)/_components/counters-list";

export default async function SupervisorCountersPage({
  searchParams,
}: {
  searchParams: Promise<CountersListParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("All Counters")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  // Scope: every stockist this SO supervises (admin bypasses via getScopeStockists).
  const scopeStockists = await getScopeStockists(user);
  if (scopeStockists.length === 0) {
    return (
      <Notice title={t("All Counters")}>
        {t("You don't supervise any stockists yet.")}
      </Notice>
    );
  }

  const list = await fetchCountersList({
    scopeStockistIds: scopeStockists.map((d) => d.id),
    params: await searchParams,
  });

  const rows: CounterListRow[] = list.rows.map((c) => ({
    ...c,
    // Supervisors don't check in themselves (that's the ISR's job) — the
    // client won't render the button anyway with showCheckIn=false, but keep
    // the flag honest in case the shape ever grows another consumer.
    canVisit: false,
    visitedToday: false,
  }));

  // One stockist names itself; several collapse to "your stockists".
  const scopeLabel =
    scopeStockists.length === 1 ? scopeStockists[0].name : t("your stockists");

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
      scope={scopeLabel}
      showCheckIn={false}
    />
  );
}
