import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, users, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeDepots } from "@/lib/supervisor/team";
import { istDateString } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { AssignBeat, type AssignCounter, type AssignmentSummary, type RepOption } from "./assign-beat";

export default async function AssignBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("Assign Beat")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const depotIds = (await getScopeDepots(user)).map((d) => d.id);

  const counterRows = depotIds.length
    ? await db
        .select({
          id: counters.id,
          name: counters.name,
          type: counters.type,
          typeOther: counters.typeOther,
          area: areas.name,
          status: counters.status,
          depotId: counters.depotId,
        })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];

  // Only FIELD reps (ISRs) in the supervised depots are assignable — a beat is
  // a field-visit list. Depot managers, SOs, etc. share the same depotId but
  // must not appear here.
  const repRows = depotIds.length
    ? (
        await db
          .select({ id: users.id, name: users.name, depotId: users.depotId, accessRoles: users.accessRoles })
          .from(users)
          .where(inArray(users.depotId, depotIds))
      ).filter((u) => u.accessRoles.includes("field"))
    : [];

  // Latest-visit stock per candidate counter (the total stock observed at its
  // most recent visit; 0 if never visited).
  const counterIds = counterRows.map((c) => c.id);
  const visitRows = counterIds.length
    ? await db
        .select({ counterId: visits.counterId, stock: visits.stock, visitedAt: visits.visitedAt })
        .from(visits)
        .where(inArray(visits.counterId, counterIds))
        .orderBy(desc(visits.visitedAt))
    : [];
  const stockByCounter = new Map<string, number>();
  for (const v of visitRows) if (!stockByCounter.has(v.counterId)) stockByCounter.set(v.counterId, v.stock);

  const candidateCounters: AssignCounter[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    typeLabel: counterTypeLabel(c.type, c.typeOther),
    area: c.area,
    depotId: c.depotId,
    stock: stockByCounter.get(c.id) ?? 0,
    trend: c.status === "declining" ? "Declining" : c.status === "dormant" ? "Flat" : "Increasing",
  }));

  const reps: RepOption[] = repRows.length
    ? repRows.map((r) => ({ id: r.id, name: r.name, depotId: r.depotId }))
    : [];


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
      initialAssignments={initialAssignments}
    />
  );
}
