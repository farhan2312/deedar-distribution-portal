import { redirect } from "next/navigation";
import { and, asc, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString } from "@/lib/date";
import { getScopeStockists, getTeamReps, pickStockist } from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
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
    const t = await getT();
    return <Notice title={t("Exceptions")}>{t("You don't have Sales Officer access.")}</Notice>;
  }
  const t = await getT();

  const { depot: requestedDepot } = await searchParams;
  const stockists = await getScopeStockists(user);
  const depot = pickStockist(stockists, requestedDepot);

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
      {/* Own header (nav `customHeader`) so the depot picker sits on the title row. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{t("Exceptions")}</h1>
          <p className="page-subtitle max-w-2xl">
            {t("Reps who clocked in but never clocked out. Force-close the day with the correct end time on their behalf.")}
          </p>
        </div>
        {stockists.length > 1 && <DepotPicker options={stockists} value={depot?.id ?? "all"} />}
      </div>

      <ExceptionsClient rows={rows} />
    </div>
  );
}
