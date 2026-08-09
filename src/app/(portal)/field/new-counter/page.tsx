import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { areas, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { NewCounterWizard, type DepotOption } from "./wizard";

export default async function NewCounterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.accessRoles.includes("field")) {
    return (
      <div style={{ maxWidth: 480 }}>
        <p style={{ fontSize: 14, color: "var(--ink-2)" }}>
          You don&apos;t have Field Salesman access.
        </p>
      </div>
    );
  }

  const [allDepots, allAreas] = await Promise.all([
    db.select().from(depots).orderBy(asc(depots.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
  ]);

  const depotOptions: DepotOption[] = allDepots.map((d) => ({
    name: d.name,
    areas: allAreas.filter((a) => a.depotId === d.id).map((a) => a.name),
  }));

  const cnfName = user.cnf?.name ?? "JHALAWAR";

  return <NewCounterWizard depots={depotOptions} cnfName={cnfName} />;
}
