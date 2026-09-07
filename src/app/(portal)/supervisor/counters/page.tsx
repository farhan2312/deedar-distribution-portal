import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeCnfs, getScopeStockists, pickCnf } from "@/lib/supervisor/team";
import { fetchCountersList, type CountersListParams } from "@/lib/counters/list";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CountersListClient, type CounterListRow } from "@/app/(portal)/_components/counters-list";
import { CnfPicker } from "../_components/cnf-picker";

export default async function SupervisorCountersPage({
  searchParams,
}: {
  searchParams: Promise<CountersListParams & { cnf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("All Counters")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const params = await searchParams;
  // Central Admin can narrow to one C&F HQ first; nobody else gets the level.
  const cnfs = await getScopeCnfs(user);
  const cnf = pickCnf(cnfs, params.cnf);

  // Scope: every stockist this SO supervises (admin bypasses via
  // getScopeStockists), narrowed to the chosen C&F. Narrowing here is all the
  // filter needs to do — the stockist dropdown and the counter rows are both
  // built from this list.
  const scopeStockists = await getScopeStockists(user, cnf?.id);
  if (scopeStockists.length === 0) {
    return (
      <Notice title={t("All Counters")}>
        {cnf ? t("This C&F HQ has no stockists yet.") : t("You don't supervise any stockists yet.")}
      </Notice>
    );
  }

  const list = await fetchCountersList({
    scopeStockistIds: scopeStockists.map((d) => d.id),
    params,
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
    scopeStockists.length === 1 ? scopeStockists[0].name : cnf?.name ?? t("your stockists");

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
      scopeFilter={cnfs.length > 0 ? <CnfPicker options={cnfs} value={cnf?.id ?? "all"} /> : null}
    />
  );
}
