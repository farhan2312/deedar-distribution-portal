import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { Notice } from "@/components/ui/notice";
import { BeatClient, type BeatCounter } from "./beat-client";

export default async function FieldBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccess(user, "field")) {
    return <Notice title="Beat">You don&apos;t have Field Salesman ISR access.</Notice>;
  }
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    return (
      <Notice title="Beat">
        You aren&apos;t assigned to a depot yet — ask your Sales Officer to map
        you to one.
      </Notice>
    );
  }

  const { start, end } = istDayBounds();
  const today = istDateString();

  // Today's Beat = ONLY the counters this rep's supervisor assigned for today.
  // Nothing else surfaces here — not even counters the rep added themselves.
  const todaysAssignments = await db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));
  const assignedIds = todaysAssignments.map((a) => a.counterId);

  const rows = assignedIds.length
    ? await db
        .select({
          id: counters.id,
          name: counters.name,
          type: counters.type,
          typeOther: counters.typeOther,
          areaName: areas.name,
          depotId: counters.depotId,
        })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.id, assignedIds))
    : [];

  const [todaysVisits, newCounterRows] = await Promise.all([
    db
      .select({ counterId: visits.counterId })
      .from(visits)
      .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end))),
    db
      .select({ id: counters.id })
      .from(counters)
      .where(and(eq(counters.createdByUserId, user.id), gte(counters.createdAt, start), lt(counters.createdAt, end))),
  ]);

  const visitedIds = new Set(todaysVisits.map((v) => v.counterId));
  const beat: BeatCounter[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: counterTypeLabel(c.type, c.typeOther),
    areaName: c.areaName,
    canVisit: isAdmin || c.depotId === user.depot?.id,
    visitedToday: visitedIds.has(c.id),
  }));

  return (
    <BeatClient
      firstName={user.name.split(/\s+/)[0]}
      depotName={user.depot?.name ?? "—"}
      reportsTo={user.reportsTo?.name ?? null}
      visitsToday={todaysVisits.length}
      newCountersToday={newCounterRows.length}
      beat={beat}
    />
  );
}
