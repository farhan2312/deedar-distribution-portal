import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { Notice } from "@/components/ui/notice";
import { NewCounterWizard } from "./wizard";

export default async function NewCounterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="New Counter">You don&apos;t have Field Salesman ISR access.</Notice>;
  }

  const isAdmin = user.accessRoles.includes("admin");

  // Admin sees the whole hierarchy and can pick any C&F → depot → area.
  if (isAdmin) {
    const [allCnfs, allDepots, allAreas] = await Promise.all([
      db.select().from(cnfs).orderBy(asc(cnfs.name)),
      db.select().from(depots).orderBy(asc(depots.name)),
      db.select().from(areas).orderBy(asc(areas.name)),
    ]);

    return (
      <NewCounterWizard
        mode="open"
        cnfs={allCnfs.map((c) => ({ id: c.id, name: c.name }))}
        depots={allDepots.map((d) => ({
          id: d.id,
          name: d.name,
          cnfId: d.cnfId,
          areas: allAreas.filter((a) => a.depotId === d.id).map((a) => ({ id: a.id, name: a.name })),
        }))}
      />
    );
  }

  // A field rep belongs to exactly one depot — depot and C&F auto-fill and lock.
  if (!user.depot) {
    return (
      <Notice title="New Counter">
        You aren&apos;t assigned to a depot yet — ask your Sales Officer to map
        you to one.
      </Notice>
    );
  }

  const [[depotRow], depotAreas] = await Promise.all([
    db.select().from(depots).where(eq(depots.id, user.depot.id)).limit(1),
    db.select().from(areas).where(eq(areas.depotId, user.depot.id)).orderBy(asc(areas.name)),
  ]);
  const [cnfRow] = depotRow ? await db.select().from(cnfs).where(eq(cnfs.id, depotRow.cnfId)).limit(1) : [];

  return (
    <NewCounterWizard
      mode="locked"
      depot={{ id: user.depot.id, name: user.depot.name }}
      cnf={{ name: cnfRow?.name ?? "—" }}
      areas={depotAreas.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
