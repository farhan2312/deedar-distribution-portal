import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import {
  countCountersReport,
  fetchCountersReport,
  fetchVisitsReport,
  REPORT_PAGE_SIZE,
  resolveReportsScope,
  visitsReportTotals,
  type ReportsParams,
} from "@/lib/khq/reports";
import { Notice } from "@/components/ui/notice";
import { ReportsClient } from "./reports-client";

export default async function KhqReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportsParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "khq")) {
    return <Notice title={t("Reports")}>{t("You don't have Kanpur HQ access.")}</Notice>;
  }

  const params = await searchParams;
  const scope = await resolveReportsScope(params);
  const offset = (scope.page - 1) * REPORT_PAGE_SIZE;
  const pageOpts = { limit: REPORT_PAGE_SIZE, offset };

  // Fetch only the active tab's data — the inactive tab pays no query cost
  // until the viewer clicks its button (which re-renders with ?tab=…).
  const [countersRows, countersTotal] =
    scope.tab === "counters"
      ? await Promise.all([
          fetchCountersReport(scope.filters, pageOpts, scope.sort),
          countCountersReport(scope.filters),
        ])
      : [[], 0];

  const [visitsRows, visitsTotals] =
    scope.tab === "visits"
      ? await Promise.all([
          fetchVisitsReport(scope.filters, pageOpts),
          visitsReportTotals(scope.filters),
        ])
      : [[], { count: 0, sold: 0, bySku: { DG10: 0, DG20: 0, DB20: 0, DB40: 0 } }];

  return (
    <ReportsClient
      scope={scope}
      counters={countersRows}
      countersTotal={countersTotal}
      visits={visitsRows}
      visitsTotal={visitsTotals.count}
      visitsSold={visitsTotals.sold}
      visitsSoldBySku={visitsTotals.bySku}
      pageSize={REPORT_PAGE_SIZE}
    />
  );
}
