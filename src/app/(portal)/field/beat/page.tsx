import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDateString, istDayBounds } from "@/lib/date";
import { Notice } from "@/components/ui/notice";
import { BeatClient, type BeatCounter } from "./beat-client";

export default async function FieldBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccess(user, "field")) {
    return <Notice title="Beat">You don&apos;t have Field Salesman access.</Notice>;
  }
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    return (
      <Notice title="Beat">
        You aren&apos;t assigned to a depot yet — ask your supervisor to map you
        to one.
      </Notice>
    );
  }

  const { start, end } = istDayBounds();
  const today = istDateString();

  const todaysAssignments = await db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));
  const assignedIds = todaysAssignments.map((a) => a.counterId);

  // Beat = counters this rep created themselves, UNION counters their
  // supervisor assigned to them for today. No other source of visibility.
  // Admin is unrestricted — its "beat" is every counter, company-wide.
  const scope = isAdmin
    ? undefined
    : assignedIds.length
      ? or(eq(counters.createdByUserId, user.id), inArray(counters.id, assignedIds))
      : eq(counters.createdByUserId, user.id);

  const counterQuery = db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      areaName: areas.name,
      depotId: counters.depotId,
      createdByUserId: counters.createdByUserId,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId));

  const [rows, todaysVisits, newCounterRows] = await Promise.all([
    scope ? counterQuery.where(scope) : counterQuery,
    // Admin's stat tiles reflect the whole company today, not just their own visits.
    db
      .select({ counterId: visits.counterId })
      .from(visits)
      .where(
        isAdmin
          ? and(gte(visits.visitedAt, start), lt(visits.visitedAt, end))
          : and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end)),
      ),
    db
      .select({ id: counters.id })
      .from(counters)
      .where(
        isAdmin
          ? and(gte(counters.createdAt, start), lt(counters.createdAt, end))
          : and(eq(counters.createdByUserId, user.id), gte(counters.createdAt, start), lt(counters.createdAt, end)),
      ),
  ]);

  const visitedIds = new Set(todaysVisits.map((v) => v.counterId));
  const assignedIdSet = new Set(assignedIds);
  const beat: BeatCounter[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    areaName: c.areaName,
    addedByMe: c.createdByUserId === user.id,
    assignedBySO: assignedIdSet.has(c.id),
    canVisit: isAdmin || c.depotId === user.depot?.id,
    visitedToday: visitedIds.has(c.id),
  }));

  return (
    <BeatClient
      firstName={user.name.split(/\s+/)[0]}
      depotName={isAdmin ? "All depots" : user.depot!.name}
      reportsTo={user.reportsTo?.name ?? null}
      visitsToday={todaysVisits.length}
      newCountersToday={newCounterRows.length}
      beat={beat}
      beatLabel={isAdmin ? "All Counters" : "Today's Beat"}
    />
  );
}
