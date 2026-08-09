import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { AssignBeat, type AssignCounter, type RepOption } from "./assign-beat";

export default async function AssignBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.accessRoles.includes("supervisor")) {
    return <p style={{ fontSize: 14, color: "var(--ink-2)" }}>You don&apos;t have Supervisor access.</p>;
  }

  const depotIds = user.supervisedDepots.map((d) => d.id);
  if (user.depot) depotIds.push(user.depot.id);

  const counterRows = depotIds.length
    ? await db
        .select({
          id: counters.id,
          name: counters.name,
          type: counters.type,
          area: areas.name,
          stock: counters.stock,
          status: counters.status,
        })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];

  // Field reps in the supervised depots become assignable.
  const repRows = depotIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.depotId, depotIds))
    : [];

  const candidateCounters: AssignCounter[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    area: c.area,
    stock: c.stock,
    trend: c.status === "declining" ? "Declining" : c.status === "dormant" ? "Flat" : "Increasing",
  }));

  const reps: RepOption[] = repRows.length
    ? repRows.map((r) => ({ id: r.id, name: r.name }))
    : [{ id: "self", name: user.name }];

  const areaOptions = [...new Set(counterRows.map((c) => c.area))];

  return <AssignBeat counters={candidateCounters} reps={reps} areaOptions={areaOptions} />;
}
