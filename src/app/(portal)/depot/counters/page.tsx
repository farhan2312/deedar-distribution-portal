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
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "depot")) {
    const t = await getT();
    return <Notice title={t("Counters")}>{t("You don't have Stockist access.")}</Notice>;
  }

  const scope = await stockistScope(user);
  if (scope.length === 0) {
    const t = await getT();
    return <Notice title={t("Counters")}>{t("You aren't mapped to a stockist yet — ask Central Admin.")}</Notice>;
  }
  const { depot: requested } = await searchParams;
  const depot = pickStockist(scope, requested)!;
  const data = await getDepotCountersData(depot.id);

  return <DepotCountersClient stockistName={depot.name} scope={scope} selectedId={depot.id} data={data} />;
}
