import { redirect } from "next/navigation";
import { and, asc, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString } from "@/lib/date";
import { getScopeDepots, getTeamReps, pickDepot } from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";
import { ExceptionsClient, type ExceptionRow } from "./exceptions-client";

export default async function SupervisorExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Exceptions">You don&apos;t have Supervisor access.</Notice>;
  }

  const { depot: requestedDepot } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);
  const repName = new Map(reps.map((r) => [r.id, r.name]));
  const today = istDateString();
  const now = new Date();

  // Open days: started but never ended — the rep forgot to clock out.
  const openRows = repIds.length
    ? await db
        .select()
        .from(dayLogs)
        .where(and(inArray(dayLogs.userId, repIds), isNotNull(dayLogs.startAt), isNull(dayLogs.endAt)))
        .orderBy(asc(dayLogs.logDate))
    : [];

  const rows: ExceptionRow[] = openRows.map((l) => ({
    repUserId: l.userId,
    repName: repName.get(l.userId) ?? "—",
    logDate: l.logDate,
    dateLabel: formatISTDate(l.logDate),
    startLabel: formatISTTime(l.startAt),
    startAtISO: l.startAt!.toISOString(),
    elapsedLabel: durationLabel(l.startAt, now),
    isToday: l.logDate === today,
  }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Exceptions — open day logs
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            Reps who clocked in but never clocked out. Force-close the day with the
            correct end time on their behalf.
          </p>
        </div>
        {depots.length > 1 && <DepotPicker options={depots} value={depot?.id ?? "all"} />}
      </div>

      <ExceptionsClient rows={rows} />
    </div>
  );
}
