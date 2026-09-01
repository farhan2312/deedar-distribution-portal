import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { stockistScope, getDepotCountersData, pickStockist } from "@/lib/depot/data";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { DepotCountersClient } from "./counters-client";

export default async function DepotCountersPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A dealer or sub-dealer manager reaches the same screens as a depot.
  if (!canAccess(user, "depot") && !canAccess(user, "dealer")) {
    const t = await getT();
    return <Notice title={t("Counters")}>{t("You don't have Stockist access.")}</Notice>;
  }

  const scope = await stockistScope(user);
  if (scope.length === 0) {
    const t = await getT();
    return <Notice title={t("Counters")}>{t("You aren't mapped to a stockist yet — ask Central Admin.")}</Notice>;
  }
  const { depot: requested, page } = await searchParams;
  const depot = pickStockist(scope, requested)!;
  const data = await getDepotCountersData(
    depot.id,
    Math.max(1, Number.parseInt(page ?? "1", 10) || 1),
  );

  return <DepotCountersClient stockistName={depot.name} scope={scope} selectedId={depot.id} data={data} />;
}
