import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, users, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeStockists } from "@/lib/supervisor/team";
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

  const stockistIds = (await getScopeStockists(user)).map((d) => d.id);
  const today = istDateString();

  /*
   * The whole page in ONE round trip.
   *
   * Counters, reps, each counter's latest visit and the forward assignment
   * book used to be read one after another, the last two waiting on ids from
   * the first two — four waits on a database ~75 ms away before anything could
   * render. Each is keyed on the stockist scope instead, the two that needed
   * ids through a subquery, so they all leave together.
   */
  const inScopeCounters = db
    .select({ id: counters.id })
    .from(counters)
    .where(inArray(counters.stockistId, stockistIds));
  const inScopeUsers = db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.stockistId, stockistIds));

  const [counterRows, userRows, latestVisits, assignmentRows] = stockistIds.length
    ? await Promise.all([
        db
          .select({
            id: counters.id,
            name: counters.name,
            type: counters.type,
            typeOther: counters.typeOther,
            area: areas.name,
            status: counters.status,
            stockistId: counters.stockistId,
          })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.stockistId, stockistIds)),
        db
          .select({ id: users.id, name: users.name, stockistId: users.stockistId, accessRoles: users.accessRoles })
          .from(users)
          .where(inArray(users.stockistId, stockistIds)),
        // Each candidate counter's most recent visit: when it was, and the
        // total stock recorded on it. DISTINCT ON returns exactly one row per
        // counter — this used to read every visit ever made to these counters
        // and keep the first of each, a query that grew with the business for
        // one row apiece.
        db
          .selectDistinctOn([visits.counterId], {
            counterId: visits.counterId,
            stock: visits.stock,
            visitedAt: visits.visitedAt,
          })
          .from(visits)
          .where(inArray(visits.counterId, inScopeCounters))
          // The id breaks a tie between two visits in the same instant, so the
          // pick is stable rather than whichever row the planner met first.
          .orderBy(visits.counterId, desc(visits.visitedAt), desc(visits.id)),
        // Real assignment history (today onward) — shown per selected date in
        // the client. Scoped here to the stockists' users, and narrowed to the
        // field reps below, which is the set the rep picker offers.
        db
          .select({
            repUserId: beatAssignments.repUserId,
            counterId: beatAssignments.counterId,
            beatDate: beatAssignments.beatDate,
          })
          .from(beatAssignments)
          .where(
            and(
              inArray(beatAssignments.repUserId, inScopeUsers),
              gte(beatAssignments.beatDate, today),
            ),
          ),
      ])
    : [[], [], [], []];

  // Only FIELD reps (ISRs) in the supervised stockists are assignable — a beat
  // is a field-visit list. Depot managers, SOs, etc. share the same stockistId
  // but must not appear here.
  const repRows = userRows.filter((u) => u.accessRoles.includes("field"));
  const latestByCounter = new Map(latestVisits.map((v) => [v.counterId, v]));

  const candidateCounters: AssignCounter[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    typeLabel: counterTypeLabel(c.type, c.typeOther),
    area: c.area,
    stockistId: c.stockistId,
    // Null, not 0, for a counter nobody has visited: "never checked" and
    // "checked and empty" are different things to plan a beat around.
    stock: latestByCounter.get(c.id)?.stock ?? null,
    lastVisitAt: latestByCounter.get(c.id)?.visitedAt.toISOString() ?? null,
    trend: c.status === "declining" ? "Declining" : c.status === "dormant" ? "Flat" : "Increasing",
  }));

  const reps: RepOption[] = repRows.length
    ? repRows.map((r) => ({ id: r.id, name: r.name, stockistId: r.stockistId }))
    : [];

  const repNameById = new Map(repRows.map((r) => [r.id, r.name]));
  const grouped = new Map<string, AssignmentSummary>();
  for (const row of assignmentRows) {
    // A row belonging to a non-field user in the same stockist is skipped, so
    // the summary covers exactly the reps the picker offers.
    if (!repNameById.has(row.repUserId)) continue;
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
