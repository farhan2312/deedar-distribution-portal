import { redirect } from "next/navigation";
import { and, desc, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString } from "@/lib/date";
import {
  getScopeDepots,
  getTeamDayLogs,
  getTeamReps,
  pickDepot,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";
import { dayState, DayLogTables, type HistoryRow, type TodayRow } from "../_components/day-log-tables";

export default async function SupervisorDayLogPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Day Log">You don&apos;t have Sales Officer access.</Notice>;
  }
  const isAdmin = user.accessRoles.includes("admin");

  const { depot: requestedDepot } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);
  const repName = new Map(reps.map((r) => [r.id, r.name]));

  const today = istDateString();
  const [todayLogs, historyRows] = await Promise.all([
    getTeamDayLogs(repIds, today),
    repIds.length
      ? db
          .select()
          .from(dayLogs)
          .where(and(inArray(dayLogs.userId, repIds), lt(dayLogs.logDate, today)))
          .orderBy(desc(dayLogs.logDate))
          .limit(80)
      : Promise.resolve([]),
  ]);

  const todayRows: TodayRow[] = reps.map((r) => {
    const log = todayLogs.get(r.id);
    return {
      key: r.id,
      repName: r.name,
      startLabel: formatISTTime(log?.startAt),
      endLabel: formatISTTime(log?.endAt),
      onJobLabel: durationLabel(log?.startAt ?? null, log?.endAt ?? null),
      state: dayState(log?.startAt ?? null, log?.endAt ?? null),
      forced: !!log?.endForced,
    };
  });
  const history: HistoryRow[] = historyRows.map((h) => ({
    key: h.id,
    repName: repName.get(h.userId) ?? "—",
    dateLabel: formatISTDate(h.logDate),
    startLabel: formatISTTime(h.startAt),
    endLabel: formatISTTime(h.endAt),
    onJobLabel: durationLabel(h.startAt, h.endAt),
    state: dayState(h.startAt, h.endAt),
    forced: !!h.endForced,
  }));

  const scopeLabel = depot?.name ?? (depots.length > 1 ? "All Depots" : depots[0]?.name ?? "Your Depot");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* Page title comes from the shell; this carries the scope in view. */}
          <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {scopeLabel}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {isAdmin
              ? "Clock-in / clock-out for every field salesman, company-wide."
              : "Clock-in / clock-out for every salesman who reports to you."}
          </p>
        </div>
        {depots.length > 1 && <DepotPicker options={depots} value={depot?.id ?? "all"} />}
      </div>

      {reps.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          {isAdmin ? "No field reps yet." : `No field reps report to you${depot ? " in this depot" : ""} yet.`}
        </p>
      ) : (
        <DayLogTables today={todayRows} history={history} />
      )}
    </div>
  );
}
