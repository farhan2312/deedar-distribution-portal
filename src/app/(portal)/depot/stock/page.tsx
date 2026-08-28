import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { stockistScope, getDepotStockData, pickStockist } from "@/lib/depot/data";
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
  if (!canAccess(user, "depot")) {
    const t = await getT();
    return <Notice title={t("Stock")}>{t("You don't have Stockist access.")}</Notice>;
  }

  const scope = await stockistScope(user);
  if (scope.length === 0) {
    const t = await getT();
    return <Notice title={t("Stock")}>{t("You aren't mapped to a stockist yet — ask Central Admin.")}</Notice>;
  }
  const { depot: requested } = await searchParams;
  const depot = pickStockist(scope, requested)!;
  const data = await getDepotStockData(depot.id);

  return <DepotStockClient depot={depot} scope={scope} data={data} />;
}
