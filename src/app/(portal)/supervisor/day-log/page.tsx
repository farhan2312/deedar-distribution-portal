import { redirect } from "next/navigation";
import { and, desc, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, formatISTTime, istDateString } from "@/lib/date";
import {
  getScopeCnfs,
  getScopeStockists,
  getTeamDayLogs,
  getTeamReps,
  pickCnf,
  pickStockist,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { CnfPicker } from "../_components/cnf-picker";
import { DepotPicker } from "../_components/depot-picker";
import { dayState, DayLogTables, type HistoryRow, type TodayRow } from "../_components/day-log-tables";

export default async function SupervisorDayLogPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("Day Log")}>{t("You don't have Sales Officer access.")}</Notice>;
  }
  const t = await getT();
  const isAdmin = user.accessRoles.includes("admin");

  const { cnf: requestedCnf, depot: requestedDepot } = await searchParams;
  // The C&F level is Central Admin's alone; for everyone else `cnfs` comes
  // back empty and the picker never renders.
  const cnfs = await getScopeCnfs(user);
  const cnf = pickCnf(cnfs, requestedCnf);
  const stockists = await getScopeStockists(user, cnf?.id);
  const depot = pickStockist(stockists, requestedDepot);

  // With a C&F chosen but no depot, the team is every rep across its
  // stockists — otherwise picking a C&F would still show the whole company.
  const reps = await getTeamReps(user, depot?.id, cnf ? stockists.map((s) => s.id) : undefined);
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

  const scopeLabel =
    depot?.name ??
    cnf?.name ??
    (stockists.length > 1 ? t("All stockists") : stockists[0]?.name ?? t("Your stockist"));

  return (
    <div>
      {/* Title and description come from the shell; this carries the scope. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {scopeLabel}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {cnfs.length > 0 && <CnfPicker options={cnfs} value={cnf?.id ?? "all"} />}
          {stockists.length > 1 && <DepotPicker options={stockists} value={depot?.id ?? "all"} />}
        </div>
      </div>

      {reps.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          {isAdmin
            ? t("No field reps yet.")
            : depot
              ? t("No field reps report to you in this stockist yet.")
              : t("No field reps report to you yet.")}
        </p>
      ) : (
        <DayLogTables today={todayRows} history={history} />
      )}
    </div>
  );
}
