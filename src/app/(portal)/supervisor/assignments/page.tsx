import { redirect } from "next/navigation";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, depots, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getScopeDepots } from "@/lib/supervisor/team";
import { formatISTDate, istDateRange, istDateString } from "@/lib/date";
import { Notice } from "@/components/ui/notice";

/** Beats are scheduled up to a week out (see the Assign Beat date picker). */
const WEEK_DAYS = 7;

export default async function AssignmentSummaryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Assignment Summary">You don&apos;t have Sales Officer access.</Notice>;
  }

  // Same scope as Assign Beat — every rep this SO can schedule appears here,
  // including beats another SO or admin assigned to them.
  const depotIds = (await getScopeDepots(user)).map((d) => d.id);
  const repRows = depotIds.length
    ? (
        await db
          .select({ id: users.id, accessRoles: users.accessRoles })
          .from(users)
          .where(inArray(users.depotId, depotIds))
      ).filter((u) => u.accessRoles.includes("field"))
    : [];
  const repIds = repRows.map((r) => r.id);

  const today = istDateString();
  const rows = repIds.length
    ? await db
        .select({
          beatDate: beatAssignments.beatDate,
          repUserId: beatAssignments.repUserId,
          repName: users.name,
          counterName: counters.name,
          areaName: areas.name,
          depotName: depots.name,
        })
        .from(beatAssignments)
        .innerJoin(users, eq(users.id, beatAssignments.repUserId))
        .innerJoin(counters, eq(counters.id, beatAssignments.counterId))
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .innerJoin(depots, eq(depots.id, counters.depotId))
        .where(and(inArray(beatAssignments.repUserId, repIds), gte(beatAssignments.beatDate, today)))
        .orderBy(asc(beatAssignments.beatDate), asc(users.name), asc(counters.name))
    : [];

  // One row per (rep, day) — the unit a beat is actually assigned in.
  type Group = {
    key: string;
    beatDate: string;
    repName: string;
    depotName: string;
    areas: Set<string>;
    counterNames: string[];
  };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.beatDate}__${r.repUserId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        beatDate: r.beatDate,
        repName: r.repName,
        depotName: r.depotName,
        areas: new Set(),
        counterNames: [],
      };
      groups.set(key, g);
    }
    g.areas.add(r.areaName);
    g.counterNames.push(r.counterName);
  }
  const summary = [...groups.values()];

  // Only the days a beat actually falls on, within the scheduling window.
  const horizon = new Set(istDateRange(WEEK_DAYS + 1));
  const upcoming = summary.filter((g) => horizon.has(g.beatDate));
  const totalCounters = upcoming.reduce((n, g) => n + g.counterNames.length, 0);

  return (
    <div>
      {upcoming.length > 0 && (
        <p className="mb-5 text-[13px] font-medium" style={{ color: "var(--ink-2)" }}>
          {upcoming.length} beat{upcoming.length === 1 ? "" : "s"} · {totalCounters} counters scheduled.
        </p>
      )}

      {upcoming.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          No beats scheduled for the coming week — assign one from Assign Beat.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {["Date", "Rep", "Scope", "Counters"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcoming.map((g) => {
                // All counters in a beat share the rep's depot, so a single
                // area means the beat was scoped to that area.
                const areaList = [...g.areas].sort((a, b) => a.localeCompare(b));
                const scope =
                  areaList.length === 1 ? `Area: ${areaList[0]}` : `Depot: ${g.depotName}`;
                return (
                  <tr key={g.key}>
                    <td className="whitespace-nowrap font-semibold">{formatISTDate(g.beatDate)}</td>
                    <td className="whitespace-nowrap" style={{ color: "var(--accent)" }}>
                      {g.repName}
                    </td>
                    <td className="whitespace-nowrap">{scope}</td>
                    <td>
                      <span className="font-semibold">{g.counterNames.length}</span>
                      <span style={{ color: "var(--ink-3)" }}> — {g.counterNames.join(", ")}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
