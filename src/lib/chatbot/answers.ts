import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessRequests,
  beatAssignments,
  counters,
  dayLogs,
  stockistStock,
  stockists,
  visits,
} from "@/db/schema";
import { durationLabel, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getBugInbox } from "@/lib/bugs/notifications";
import {
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  type ScopeUser,
} from "@/lib/supervisor/team";
import { SEGMENT_LABEL } from "@/lib/field/products";
import { INTENTS, type IntentAnswer } from "./catalog";

/**
 * The query behind each chatbot question.
 *
 * Almost every answer here reuses a helper that already backs a real screen —
 * the Sales Officer answers are pure `supervisor/team.ts`, the bug-report
 * answer is the same `getBugInbox` the top-bar bell uses. The point of the
 * chatbot is to route to existing data, not to grow a second data layer.
 */

/** The slice of `getCurrentUser()` an answer needs. Structurally satisfied by
 * the real return value, so it can be passed straight through. */
export type AnswerUser = ScopeUser & {
  id: string;
  name: string;
  cnf: { id: string; name: string } | null;
};

type T = (key: string) => string;

/** Show at most this many names/rows in an answer before switching to a
 * "+N more" line — the panel is a phone-width popover, not a report. */
const MAX_ITEMS = 6;

/**
 * Depot ids a "company" question is limited to.
 *
 * `null` means unrestricted (Kanpur HQ and admin genuinely see everything).
 * A C&F HQ user is scoped to the stockists under their own C&F — the same rule
 * their dashboard and map already apply, so the chatbot can't become a side
 * channel to another C&F's numbers.
 */
async function companyDepotIds(user: AnswerUser): Promise<string[] | null> {
  if (user.accessRoles.includes("admin") || user.accessRoles.includes("khq")) return null;
  if (!user.cnf) return []; // hq user with no C&F mapped — sees nothing
  const rows = await db
    .select({ id: stockists.id })
    .from(stockists)
    .where(eq(stockists.cnfId, user.cnf.id));
  return rows.map((r) => r.id);
}

/** Trim a list to MAX_ITEMS, appending a "+N more" row when it overflows. */
function capItems(items: { label: string; value?: string }[], t: T): { label: string; value?: string }[] {
  if (items.length <= MAX_ITEMS) return items;
  const shown = items.slice(0, MAX_ITEMS);
  shown.push({ label: `+${items.length - MAX_ITEMS} ${t("more")}` });
  return shown;
}

// ── Field ISR ────────────────────────────────────────────────────────────

async function myVisitsToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const { start, end } = istDayBounds();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visits)
    .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end)));
  const n = row?.n ?? 0;
  return {
    text: n === 0 ? t("You haven't recorded any visits today yet.") : `${n} ${t(n === 1 ? "visit today." : "visits today.")}`,
    link: { href: "/field/beat", label: t("Open Beat") },
  };
}

async function myBeatToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const today = istDateString();
  const { start, end } = istDayBounds();

  // No `getBeatForRep` helper exists — the beat query is inline in the Beat
  // page. Kept local here rather than refactoring that page, so this feature
  // stays additive and can't regress a working screen.
  const rows = await db
    .select({
      counterId: beatAssignments.counterId,
      name: counters.name,
      type: counters.type,
      typeOther: counters.typeOther,
    })
    .from(beatAssignments)
    .innerJoin(counters, eq(counters.id, beatAssignments.counterId))
    .where(and(eq(beatAssignments.repUserId, user.id), eq(beatAssignments.beatDate, today)));

  if (rows.length === 0) {
    return { text: t("No counters assigned for today yet — your Sales Officer (SO) sets your daily beat.") };
  }

  const visited = await db
    .select({ counterId: visits.counterId })
    .from(visits)
    .where(
      and(
        eq(visits.userId, user.id),
        gte(visits.visitedAt, start),
        lt(visits.visitedAt, end),
        inArray(
          visits.counterId,
          rows.map((r) => r.counterId),
        ),
      ),
    );
  const done = new Set(visited.map((v) => v.counterId));
  const remaining = rows.length - done.size;

  return {
    text: `${rows.length} ${t(rows.length === 1 ? "counter on your beat." : "counters on your beat.")} ${remaining} ${t("remaining")}.`,
    items: capItems(
      rows.map((r) => ({
        label: r.name,
        value: done.has(r.counterId) ? t("Visited") : counterTypeLabel(r.type, r.typeOther),
      })),
      t,
    ),
    link: { href: "/field/beat", label: t("Open Beat") },
  };
}

async function amIClockedIn(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const [log] = await db
    .select({ startAt: dayLogs.startAt, endAt: dayLogs.endAt })
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.logDate, istDateString())))
    .limit(1);

  if (!log?.startAt) {
    return {
      text: t("You haven't started your day yet."),
      link: { href: "/field/day-log", label: t("Open Day Log") },
    };
  }
  if (log.endAt) {
    return {
      text: `${t("Day complete")} — ${t("On job")}: ${durationLabel(log.startAt, log.endAt)}.`,
      link: { href: "/field/day-log", label: t("Open Day Log") },
    };
  }
  return {
    text: `${t("Clocked in since")} ${formatISTTime(log.startAt)} — ${durationLabel(log.startAt, new Date())} ${t("so far")}.`,
    link: { href: "/field/day-log", label: t("Open Day Log") },
  };
}

async function myNewCountersToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const { start, end } = istDayBounds();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(counters)
    .where(
      and(
        eq(counters.createdByUserId, user.id),
        gte(counters.createdAt, start),
        lt(counters.createdAt, end),
      ),
    );
  const n = row?.n ?? 0;
  return {
    text: n === 0 ? t("You haven't added any new counters today.") : `${n} ${t(n === 1 ? "new counter added today." : "new counters added today.")}`,
    link: { href: "/field/new-counter", label: t("Add a counter") },
  };
}

// ── Sales Officer ────────────────────────────────────────────────────────

async function teamNotClockedIn(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const reps = await getTeamReps(user);
  if (reps.length === 0) return { text: t("No field reps report to you yet.") };

  const logs = await getTeamDayLogs(
    reps.map((r) => r.id),
    istDateString(),
  );
  const missing = reps.filter((r) => !logs.get(r.id)?.startAt);

  if (missing.length === 0) {
    return { text: `${t("Everyone is clocked in")} — ${reps.length}/${reps.length}.` };
  }
  return {
    text: `${missing.length} ${t(missing.length === 1 ? "rep hasn't clocked in yet." : "reps haven't clocked in yet.")}`,
    items: capItems(missing.map((r) => ({ label: r.name, value: r.stockistName ?? undefined })), t),
    link: { href: "/supervisor/day-log", label: t("Open Day Log") },
  };
}

async function teamVisitsToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const reps = await getTeamReps(user);
  if (reps.length === 0) return { text: t("No field reps report to you yet.") };

  const visitMap = await getVisitsToday(
    reps.map((r) => r.id),
    istDayBounds(),
  );
  const total = [...visitMap.values()].reduce((s, v) => s + v.count, 0);
  const activeReps = [...visitMap.values()].filter((v) => v.count > 0).length;

  return {
    text: `${total} ${t(total === 1 ? "visit today" : "visits today")} ${t("across")} ${activeReps}/${reps.length} ${t("reps")}.`,
    link: { href: "/supervisor/analytics", label: t("Open Analytics") },
  };
}

async function teamOpenDays(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const reps = await getTeamReps(user);
  if (reps.length === 0) return { text: t("No field reps report to you yet.") };

  const repName = new Map(reps.map((r) => [r.id, r.name]));
  // Same rule the Exceptions screen uses: started, never ended — and not
  // limited to today, because a day left open overnight is the real problem.
  const rows = await db
    .select({ userId: dayLogs.userId, logDate: dayLogs.logDate, startAt: dayLogs.startAt })
    .from(dayLogs)
    .where(
      and(
        inArray(
          dayLogs.userId,
          reps.map((r) => r.id),
        ),
        isNotNull(dayLogs.startAt),
        isNull(dayLogs.endAt),
      ),
    )
    .orderBy(desc(dayLogs.logDate));

  if (rows.length === 0) return { text: t("No open day logs 🎉") };

  return {
    text: `${rows.length} ${t(rows.length === 1 ? "day is still open." : "days are still open.")}`,
    items: capItems(
      rows.map((r) => ({ label: repName.get(r.userId) ?? "—", value: r.logDate })),
      t,
    ),
    link: { href: "/supervisor/exceptions", label: t("Open Exceptions") },
  };
}

async function teamTopRep(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const reps = await getTeamReps(user);
  if (reps.length === 0) return { text: t("No field reps report to you yet.") };

  const visitMap = await getVisitsToday(
    reps.map((r) => r.id),
    istDayBounds(),
  );
  const ranked = reps
    .map((r) => ({ name: r.name, count: visitMap.get(r.id)?.count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) return { text: t("No visits recorded by your team today yet.") };

  return {
    text: `${ranked[0].name} — ${ranked[0].count} ${t(ranked[0].count === 1 ? "visit" : "visits")}.`,
    items: capItems(
      ranked.slice(1).map((r) => ({ label: r.name, value: String(r.count) })),
      t,
    ),
    link: { href: "/supervisor/analytics", label: t("Open Analytics") },
  };
}

// ── Depot / Dealer / Sub-Dealer ──────────────────────────────────────────

/**
 * The stockists a stockist-role user's answers cover: their own, plus — when
 * theirs is a dealer — its sub-dealers. Mirrors `stockistScope` on the portal,
 * so the chatbot reports the same numbers the Stock screen shows.
 */
async function myStockistIds(user: AnswerUser): Promise<string[]> {
  if (!user.depot) return [];
  const [self] = await db
    .select({ id: stockists.id, kind: stockists.kind })
    .from(stockists)
    .where(eq(stockists.id, user.depot.id))
    .limit(1);
  if (!self) return [];
  if (self.kind !== "dealer") return [self.id];
  const kids = await db
    .select({ id: stockists.id })
    .from(stockists)
    .where(eq(stockists.parentId, self.id));
  return [self.id, ...kids.map((k) => k.id)];
}

async function myStockTotal(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const ids = await myStockistIds(user);
  if (ids.length === 0) return { text: t("You aren't mapped to a stockist yet — ask Central Admin.") };

  const rows = await db
    .select({ segment: stockistStock.segment, onHand: stockistStock.onHand })
    .from(stockistStock)
    .where(inArray(stockistStock.stockistId, ids));

  // Summed per SKU, since a dealer's list spans their sub-dealers too.
  const bySeg = new Map<string, number>();
  for (const r of rows) bySeg.set(r.segment, (bySeg.get(r.segment) ?? 0) + r.onHand);
  const total = [...bySeg.values()].reduce((s, n) => s + n, 0);

  if (total === 0) return { text: t("No stock recorded yet."), link: { href: "/depot/stock", label: t("Open Stock") } };

  return {
    text: `${total.toLocaleString("en-IN")} ${t("packets on hand")}${ids.length > 1 ? ` (${t("incl. sub-dealers")})` : ""}.`,
    items: capItems(
      [...bySeg.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([seg, n]) => ({
          label: SEGMENT_LABEL[seg as keyof typeof SEGMENT_LABEL] ?? seg,
          value: n.toLocaleString("en-IN"),
        })),
      t,
    ),
    link: { href: "/depot/stock", label: t("Open Stock") },
  };
}

async function myStockLow(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const ids = await myStockistIds(user);
  if (ids.length === 0) return { text: t("You aren't mapped to a stockist yet — ask Central Admin.") };

  const rows = await db
    .select({
      segment: stockistStock.segment,
      onHand: stockistStock.onHand,
      lowThreshold: stockistStock.lowThreshold,
    })
    .from(stockistStock)
    .where(inArray(stockistStock.stockistId, ids));

  const bySeg = new Map<string, { onHand: number; low: number }>();
  for (const r of rows) {
    const acc = bySeg.get(r.segment) ?? { onHand: 0, low: 0 };
    acc.onHand += r.onHand;
    acc.low += r.lowThreshold;
    bySeg.set(r.segment, acc);
  }
  const low = [...bySeg.entries()].filter(([, v]) => v.onHand < v.low);

  if (bySeg.size === 0) return { text: t("No stock recorded yet."), link: { href: "/depot/stock", label: t("Open Stock") } };
  if (low.length === 0) return { text: t("Nothing is below its threshold."), link: { href: "/depot/stock", label: t("Open Stock") } };

  return {
    text: `${low.length} ${t(low.length === 1 ? "product is running low." : "products are running low.")}`,
    items: low.map(([seg, v]) => ({
      label: SEGMENT_LABEL[seg as keyof typeof SEGMENT_LABEL] ?? seg,
      value: `${v.onHand} / ${v.low}`,
    })),
    link: { href: "/depot/stock", label: t("Open Stock") },
  };
}

async function myCounters(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const ids = await myStockistIds(user);
  if (ids.length === 0) return { text: t("You aren't mapped to a stockist yet — ask Central Admin.") };

  const rows = await db
    .select({ status: counters.status, n: sql<number>`count(*)::int` })
    .from(counters)
    .where(inArray(counters.stockistId, ids))
    .groupBy(counters.status);

  const total = rows.reduce((s, r) => s + r.n, 0);
  if (total === 0) return { text: t("No counters mapped to your stockist yet.") };

  return {
    text: `${total.toLocaleString("en-IN")} ${t(total === 1 ? "counter" : "counters")}${ids.length > 1 ? ` (${t("incl. sub-dealers")})` : ""}.`,
    items: rows.map((r) => ({ label: t(r.status), value: String(r.n) })),
    link: { href: "/depot/counters", label: t("Open Counters") },
  };
}

// ── C&F HQ / Kanpur HQ / Admin ───────────────────────────────────────────

/** Visit-scope predicate for company questions, honouring the C&F limit. */
function visitScope(stockistIds: string[] | null, start: Date, end: Date) {
  const window = and(gte(visits.visitedAt, start), lt(visits.visitedAt, end));
  return stockistIds ? and(window, inArray(counters.stockistId, stockistIds)) : window;
}

async function packetsSoldToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const stockistIds = await companyDepotIds(user);
  if (stockistIds?.length === 0) return { text: t("You aren't mapped to a C&F yet — ask Central Admin.") };
  const { start, end } = istDayBounds();

  const [row] = await db
    .select({ packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int` })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(visitScope(stockistIds, start, end));

  const n = row?.packets ?? 0;
  return {
    text: n === 0 ? t("No packets sold today yet.") : `${n.toLocaleString("en-IN")} ${t("packets sold today.")}`,
    link: { href: "/khq/reports?tab=visits", label: t("Open Reports") },
  };
}

async function visitsCompanyToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const stockistIds = await companyDepotIds(user);
  if (stockistIds?.length === 0) return { text: t("You aren't mapped to a C&F yet — ask Central Admin.") };
  const { start, end } = istDayBounds();

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(visitScope(stockistIds, start, end));

  const n = row?.n ?? 0;
  return {
    text: n === 0 ? t("No visits recorded today yet.") : `${n.toLocaleString("en-IN")} ${t(n === 1 ? "visit today." : "visits today.")}`,
    link: { href: "/khq/reports?tab=visits", label: t("Open Reports") },
  };
}

async function decliningCounters(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const stockistIds = await companyDepotIds(user);
  if (stockistIds?.length === 0) return { text: t("You aren't mapped to a C&F yet — ask Central Admin.") };

  const scope = stockistIds
    ? and(eq(counters.status, "declining"), inArray(counters.stockistId, stockistIds))
    : eq(counters.status, "declining");
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(counters).where(scope);

  const n = row?.n ?? 0;
  return {
    text: n === 0 ? t("No declining counters — healthy C&F.") : `${n} ${t(n === 1 ? "counter is declining." : "counters are declining.")}`,
    link: { href: "/khq/reports?tab=counters", label: t("Open Reports") },
  };
}

async function topDepotToday(user: AnswerUser, t: T): Promise<IntentAnswer> {
  const stockistIds = await companyDepotIds(user);
  if (stockistIds?.length === 0) return { text: t("You aren't mapped to a C&F yet — ask Central Admin.") };
  const { start, end } = istDayBounds();

  const rows = await db
    .select({ name: stockists.name, kind: stockists.kind, n: sql<number>`count(*)::int` })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(visitScope(stockistIds, start, end))
    .groupBy(stockists.name, stockists.kind)
    .orderBy(desc(sql`count(*)`))
    .limit(4);

  if (rows.length === 0) return { text: t("No visits recorded today yet.") };

  // The kind is named because three now exist — "Indergarh" alone does not say
  // whether the winner is a depot, a dealer or a sub-dealer.
  const kindLabel: Record<string, string> = {
    depot: "Depot",
    dealer: "Dealer",
    sub_dealer: "Sub-Dealer",
  };

  return {
    text: `${rows[0].name} (${t(kindLabel[rows[0].kind] ?? rows[0].kind)}) — ${rows[0].n} ${t(rows[0].n === 1 ? "visit" : "visits")}.`,
    items: rows.slice(1).map((r) => ({
      label: `${r.name} · ${t(kindLabel[r.kind] ?? r.kind)}`,
      value: String(r.n),
    })),
    link: { href: "/khq/dashboard", label: t("Open Company Dashboard") },
  };
}

async function pendingAccessRequests(_user: AnswerUser, t: T): Promise<IntentAnswer> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"));

  const n = row?.n ?? 0;
  return {
    text: n === 0 ? t("No pending requests.") : `${n} ${t(n === 1 ? "request is awaiting approval." : "requests are awaiting approval.")}`,
    link: { href: "/admin/users", label: t("Open Users & access") },
  };
}

async function openBugReports(user: AnswerUser, t: T): Promise<IntentAnswer> {
  // Same reader the top-bar bell uses, so the number always agrees with the
  // badge the admin is already looking at.
  const inbox = await getBugInbox(user);
  return {
    text:
      inbox.count === 0
        ? t("No bug reports yet.")
        : `${inbox.count} ${t(inbox.count === 1 ? "report is open." : "reports are open.")}`,
    items: inbox.items.slice(0, MAX_ITEMS).map((i) => ({ label: i.title, value: i.reporterName ?? undefined })),
    link: { href: "/admin/bugs", label: t("Open Bug Tracker") },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────

/** intent id → query. Keys must stay in sync with `catalog.ts`; an id present
 * in one and not the other surfaces as an "unknown question" error rather
 * than a silent blank, which is the failure mode we want. */
const RUNNERS: Record<string, (user: AnswerUser, t: T) => Promise<IntentAnswer>> = {
  my_visits_today: myVisitsToday,
  my_beat_today: myBeatToday,
  am_i_clocked_in: amIClockedIn,
  my_new_counters_today: myNewCountersToday,

  team_not_clocked_in: teamNotClockedIn,
  team_visits_today: teamVisitsToday,
  team_open_days: teamOpenDays,
  team_top_rep: teamTopRep,

  packets_sold_today: packetsSoldToday,
  visits_company_today: visitsCompanyToday,
  declining_counters: decliningCounters,
  my_stock_total: myStockTotal,
  my_stock_low: myStockLow,
  my_counters: myCounters,
  top_depot_today: topDepotToday,
  pending_access_requests: pendingAccessRequests,
  open_bug_reports: openBugReports,
};

// Catalog and registry are two lists that must agree; nothing in the type
// system ties them together, so assert it at module load in dev. A question
// added to the menu with no query behind it would otherwise only show up as a
// runtime "Unknown question." for whoever tapped it.
if (process.env.NODE_ENV !== "production") {
  const missing = INTENTS.filter((i) => !(i.id in RUNNERS)).map((i) => i.id);
  if (missing.length > 0) {
    throw new Error(`chatbot: catalog intent(s) with no runner: ${missing.join(", ")}`);
  }
}

export async function runIntent(id: string, user: AnswerUser, t: T): Promise<IntentAnswer | null> {
  const run = RUNNERS[id];
  if (!run) return null;
  return run(user, t);
}
