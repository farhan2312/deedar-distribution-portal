import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { depotScope, getDepotCountersData, pickDepot } from "@/lib/depot/data";
import { Notice } from "@/components/ui/notice";
import { DepotCountersClient } from "./counters-client";

export default async function DepotCountersPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "dealer")) {
    return <Notice title="Counters">You don&apos;t have Depot access.</Notice>;
  }

  const scope = await depotScope(user);
  if (scope.length === 0) {
    return <Notice title="Counters">You aren&apos;t mapped to a depot yet — ask Central Admin.</Notice>;
  }
  const { depot: requested } = await searchParams;
  const depot = pickDepot(scope, requested)!;
  const data = await getDepotCountersData(depot.id);

  return <DepotCountersClient depotName={depot.name} scope={scope} selectedId={depot.id} data={data} />;
}
