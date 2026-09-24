import { redirect } from "next/navigation";
import { and, asc, desc, inArray, lt, sql } from "drizzle-orm";
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
import { asId } from "@/lib/portal/map-scope";
import { Notice } from "@/components/ui/notice";
import { CnfPicker } from "../_components/cnf-picker";
import { DepotPicker } from "../_components/depot-picker";
import { dayState, DayLogTables, type HistoryRow, type TodayRow } from "../_components/day-log-tables";

/** Days of history per page. The same 50 the audit log and the counters lists
 * use, so a pager means the same thing wherever it appears. */
const HISTORY_PAGE_SIZE = 50;

export default async function SupervisorDayLogPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string; depot?: string; hpage?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    const t = await getT();
    return <Notice title={t("Day Log")}>{t("You don't have Sales Officer access.")}</Notice>;
  }
  const t = await getT();
  const isAdmin = user.accessRoles.includes("admin");

  const { cnf: requestedCnf, depot: requestedDepot, hpage: requestedPage } = await searchParams;
  // The scope levels are read together rather than one after another: the
  // C&F list vets the id in the URL, the stockist scope is read for that same
  // id beside it, and — when neither filter is set, which is how this page
  // opens — the team too, since with no C&F and no depot it depends on
  // nothing else.
  //
  // The C&F level is Central Admin's alone; for everyone else `cnfs` comes
  // back empty and the picker never renders.
  const cnfGuess = asId(requestedCnf);
  const unfiltered = !requestedCnf && !requestedDepot;
  const [cnfs, guessedStockists, guessedReps] = await Promise.all([
    getScopeCnfs(user),
    getScopeStockists(user, cnfGuess ?? undefined),
    unfiltered ? getTeamReps(user) : Promise.resolve(null),
  ]);
  const cnf = pickCnf(cnfs, requestedCnf);
  const stockists =
    (cnf?.id ?? null) === cnfGuess ? guessedStockists : await getScopeStockists(user, cnf?.id);
  const depot = pickStockist(stockists, requestedDepot);

  // With a C&F chosen but no depot, the team is every rep across its
  // stockists — otherwise picking a C&F would still show the whole company.
  const reps =
    guessedReps ??
    (await getTeamReps(user, depot?.id, cnf ? stockists.map((s) => s.id) : undefined));
  const repIds = reps.map((r) => r.id);
  const repName = new Map(reps.map((r) => [r.id, r.name]));

  const today = istDateString();

  /*
   * History, one page at a time.
   *
   * It used to take the most recent 80 rows and stop — which is not a page but
   * a ceiling: a Sales Officer with eight reps hit it inside two weeks, and
   * everything older simply did not exist as far as this screen was concerned.
   * Now the whole history is reachable, and the cost of the page no longer
   * grows with the size of the team.
   *
   * The count and the page are read together, as elsewhere: the page the URL
   * asks for is fetched straight away and re-read only when the count turns out
   * to put it past the end.
   */
  const inScope = and(inArray(dayLogs.userId, repIds), lt(dayLogs.logDate, today));
  const historyAt = (page: number) =>
    db
      .select()
      .from(dayLogs)
      .where(inScope)
      // The id breaks ties: several reps share a log date, and LIMIT/OFFSET over
      // a non-total order drops and repeats rows across page boundaries.
      .orderBy(desc(dayLogs.logDate), asc(dayLogs.id))
      .limit(HISTORY_PAGE_SIZE)
      .offset((page - 1) * HISTORY_PAGE_SIZE);

  const asked = Math.max(1, Number.parseInt(requestedPage ?? "1", 10) || 1);
  const [todayLogs, historyCount, askedHistory] = await Promise.all([
    getTeamDayLogs(repIds, today),
    repIds.length
      ? db.select({ n: sql<number>`count(*)::int` }).from(dayLogs).where(inScope)
      : Promise.resolve([{ n: 0 }]),
    repIds.length ? historyAt(asked) : Promise.resolve([]),
  ]);

  const historyTotal = historyCount[0]?.n ?? 0;
  const historyPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
  // Clamped, not rejected: narrowing to one depot can leave the URL pointing at
  // page 6 of 2, and an empty table would read as "no history".
  const historyPage = Math.min(asked, historyPages);
  const historyRows =
    historyPage === asked ? askedHistory : await historyAt(historyPage);

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
        <DayLogTables
          today={todayRows}
          history={history}
          historyPager={{
            page: historyPage,
            totalPages: historyPages,
            total: historyTotal,
            param: "hpage",
          }}
        />
      )}
    </div>
  );
}
