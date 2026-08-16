import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { depotScope, getDepotStockData, pickDepot } from "@/lib/depot/data";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { DepotStockClient } from "./stock-client";

export default async function DepotStockPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "dealer")) {
    const t = await getT();
    return <Notice title={t("Stock")}>{t("You don't have Depot access.")}</Notice>;
  }

  const scope = await depotScope(user);
  if (scope.length === 0) {
    const t = await getT();
    return <Notice title={t("Stock")}>{t("You aren't mapped to a depot yet — ask Central Admin.")}</Notice>;
  }
  const { depot: requested } = await searchParams;
  const depot = pickDepot(scope, requested)!;
  const data = await getDepotStockData(depot.id);

  return <DepotStockClient depot={depot} scope={scope} data={data} />;
}
