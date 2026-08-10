import { redirect } from "next/navigation";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeDepots } from "@/lib/supervisor/team";
import { istDateString } from "@/lib/date";
import { Notice } from "@/components/ui/notice";
import { AssignBeat, type AssignCounter, type AssignmentSummary, type RepOption } from "./assign-beat";

export default async function AssignBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Assign Beat">You don&apos;t have Supervisor access.</Notice>;
  }

  const depotIds = (await getScopeDepots(user)).map((d) => d.id);

  const counterRows = depotIds.length
    ? await db
        .select({
          id: counters.id,
          name: counters.name,
          type: counters.type,
          area: areas.name,
          status: counters.status,
          depotId: counters.depotId,
        })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];

  // Field reps in the supervised depots become assignable.
  const repRows = depotIds.length
    ? await db
        .select({ id: users.id, name: users.name, depotId: users.depotId })
        .from(users)
        .where(inArray(users.depotId, depotIds))
    : [];

  const candidateCounters: AssignCounter[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    area: c.area,
    depotId: c.depotId,
    trend: c.status === "declining" ? "Declining" : c.status === "dormant" ? "Flat" : "Increasing",
  }));

  const reps: RepOption[] = repRows.length
    ? repRows.map((r) => ({ id: r.id, name: r.name, depotId: r.depotId }))
    : [];

  const areaOptions = [...new Set(counterRows.map((c) => c.area))];

  // Real assignment history (today onward) — shown per selected date in the client.
  const repIds = repRows.map((r) => r.id);
  const today = istDateString();
  const assignmentRows = repIds.length
    ? await db
        .select({
          repUserId: beatAssignments.repUserId,
          counterId: beatAssignments.counterId,
          beatDate: beatAssignments.beatDate,
        })
        .from(beatAssignments)
        .where(and(inArray(beatAssignments.repUserId, repIds), gte(beatAssignments.beatDate, today)))
    : [];

  const repNameById = new Map(repRows.map((r) => [r.id, r.name]));
  const grouped = new Map<string, AssignmentSummary>();
  for (const row of assignmentRows) {
    const key = `${row.repUserId}__${row.beatDate}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else {
      grouped.set(key, {
        repUserId: row.repUserId,
        repName: repNameById.get(row.repUserId) ?? "Unknown",
        beatDate: row.beatDate,
        count: 1,
      });
    }
  }
  const initialAssignments = [...grouped.values()].sort((a, b) => a.beatDate.localeCompare(b.beatDate));

  return (
    <AssignBeat
      counters={candidateCounters}
      reps={reps}
      areaOptions={areaOptions}
      initialAssignments={initialAssignments}
    />
  );
}
