import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, users, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { BeatClient, type BeatCounter } from "./beat-client";

export default async function FieldBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("Beat")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    const t = await getT();
    return (
      <Notice title={t("Beat")}>
        {t("You aren't assigned to a depot yet — ask your Sales Officer to map you to one.")}
      </Notice>
    );
  }

  const { start, end } = istDayBounds();
  const today = istDateString();

  // ISR: only their own beat assignments today. Admin: every rep's assignment
  // today, so they can audit coverage across the company. Joined to `users` so
  // an admin row can label which rep the counter is assigned to.
  const assignmentRows = await db
    .select({
      counterId: beatAssignments.counterId,
      repUserId: beatAssignments.repUserId,
      repName: users.name,
    })
    .from(beatAssignments)
    .innerJoin(users, eq(users.id, beatAssignments.repUserId))
    .where(
      isAdmin
        ? eq(beatAssignments.beatDate, today)
        : and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)),
    );

  const counterIds = [...new Set(assignmentRows.map((a) => a.counterId))];
  const counterRows = counterIds.length
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
        .where(inArray(counters.id, counterIds))
    : [];
  const counterById = new Map(counterRows.map((c) => [c.id, c]));

  // Same scoping rule for the stat cards: an ISR sees their own totals, an
  // admin sees company-wide totals for the day.
  const dayBounds = and(gte(visits.visitedAt, start), lt(visits.visitedAt, end));
  const [visitCountRows, newCounterCountRows, allVisitedRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(isAdmin ? dayBounds : and(eq(visits.userId, user.id), dayBounds)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(counters)
      .where(
        isAdmin
          ? and(gte(counters.createdAt, start), lt(counters.createdAt, end))
          : and(
              eq(counters.createdByUserId, user.id),
              gte(counters.createdAt, start),
              lt(counters.createdAt, end),
            ),
      ),
    // For row-level "visited today" flags: an ISR only cares if THEY visited,
    // but admin wants to know whether the ASSIGNED rep did — so pull the
    // (userId, counterId) pairs for today's visits and match per assignment.
    counterIds.length
      ? db
          .select({ userId: visits.userId, counterId: visits.counterId })
          .from(visits)
          .where(and(dayBounds, inArray(visits.counterId, counterIds)))
      : Promise.resolve([]),
  ]);

  const visitedPairs = new Set(allVisitedRows.map((v) => `${v.userId}__${v.counterId}`));
  const beat: BeatCounter[] = assignmentRows.flatMap((a) => {
    const c = counterById.get(a.counterId);
    if (!c) return [];
    return [{
      // Keyed per (rep, counter) so a counter assigned to two reps shows twice
      // for admin without React collapsing the rows.
      key: `${a.repUserId}__${a.counterId}`,
      id: a.counterId,
      name: c.name,
      type: counterTypeLabel(c.type, c.typeOther),
      areaName: c.areaName,
      canVisit: isAdmin || c.depotId === user.depot?.id,
      visitedToday: visitedPairs.has(`${a.repUserId}__${a.counterId}`),
      // Only surfaced by the client for admin — an ISR viewing their own beat
      // doesn't need to be told their name on every row.
      repName: isAdmin ? a.repName : null,
    }];
  });

  return (
    <BeatClient
      firstName={user.name.split(/\s+/)[0]}
      depotName={user.depot?.name ?? "—"}
      reportsTo={user.reportsTo?.name ?? null}
      visitsToday={visitCountRows[0]?.n ?? 0}
      newCountersToday={newCounterCountRows[0]?.n ?? 0}
      beat={beat}
      isAdmin={isAdmin}
    />
  );
}
