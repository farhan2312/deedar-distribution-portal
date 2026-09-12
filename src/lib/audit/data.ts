import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  auditActionEnum,
  auditLogs,
  auditModuleEnum,
  users,
  type AccessRole,
  type AuditAction,
  type AuditModule,
} from "@/db/schema";
// Shared with the client component, which cannot import from this module.
import { deviceLabel } from "./device";
import type { AuditFilters, AuditRow } from "./types";
import { TAB_ACTIONS, TAB_MODULES, type AuditTab } from "./tabs";

export type { AuditFilters, AuditRow };
export { AUDIT_TABS, isTab, type AuditTab } from "./tabs";

/**
 * Rows per page — for the activity table and the usage table alike.
 *
 * Both fetch exactly this many rows from Postgres. The log is the one table in
 * the app that grows without limit, so neither query may return "everything in
 * the window": a year of field activity is hundreds of thousands of rows, and
 * a page that reads them all to show fifty is a page that eventually stops
 * loading at all.
 */
export const AUDIT_PAGE_SIZE = 50;

export type AuditParams = {
  tab?: string;
  p?: string;
  module?: string;
  action?: string;
  actor?: string;
  q?: string;
  page?: string;
};

export function isModule(v: string | undefined): v is AuditModule {
  return !!v && (auditModuleEnum.enumValues as readonly string[]).includes(v);
}
export function isAction(v: string | undefined): v is AuditAction {
  return !!v && (auditActionEnum.enumValues as readonly string[]).includes(v);
}

/** Every predicate but the date window, which the caller owns. */
function filterWhere(f: AuditFilters, tab: AuditTab): SQL[] {
  const parts: SQL[] = [];
  // The tab is a coarse filter; the dropdowns narrow within it. Both end up in
  // the same WHERE, so a tab can never show a row its own definition excludes.
  const tabActions = TAB_ACTIONS[tab];
  if (tabActions) parts.push(inArray(auditLogs.action, tabActions));
  const tabModules = TAB_MODULES[tab];
  if (tabModules) parts.push(inArray(auditLogs.module, tabModules));
  if (f.module) parts.push(eq(auditLogs.module, f.module));
  if (f.action) parts.push(eq(auditLogs.action, f.action));
  if (f.actorId) parts.push(eq(auditLogs.actorUserId, f.actorId));
  if (f.q) {
    const like = `%${f.q}%`;
    parts.push(
      or(
        ilike(auditLogs.actorName, like),
        ilike(auditLogs.actorPhone, like),
        ilike(auditLogs.entityLabel, like),
        ilike(auditLogs.summary, like),
      )!,
    );
  }
  return parts;
}

export type AuditWindow = { start: Date; end: Date };

/**
 * Everything the audit screen renders, in one round of parallel queries.
 *
 * The headline counts are deliberately fixed at "last 24 hours" rather than
 * following the period filter: they are a health check on right now, and a
 * card reading "Failed logins: 0" because you happened to be looking at last
 * March would be worse than no card at all. Everything below them follows the
 * selected window.
 */
export async function getAuditData(
  window: AuditWindow,
  filters: AuditFilters,
  requestedPage: number,
  tab: AuditTab = "overall",
) {
  const inWindow = and(gte(auditLogs.createdAt, window.start), lt(auditLogs.createdAt, window.end))!;
  const scoped = [inWindow, ...filterWhere(filters, tab)];
  const where = scoped.length === 1 ? scoped[0] : and(...scoped);

  const day = sql`now() - interval '24 hours'`;

  const [
    [last24],
    [totals],
    byAction,
    byDay,
    heatmap,
    agents,
    topUsers,
    actorOptions,
    [{ n: total }],
  ] = await Promise.all([
    // Fixed 24h health check — see the note above.
    db
      .select({
        logins: sql<number>`count(*) filter (where ${auditLogs.action} = 'login')::int`,
        failed: sql<number>`count(*) filter (where ${auditLogs.action} = 'login_failed')::int`,
        actors: sql<number>`count(distinct ${auditLogs.actorUserId})::int`,
        actions: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(sql`${auditLogs.createdAt} >= ${day}`),

    // Same shape for the selected window, for the sub-captions.
    db
      .select({
        logins: sql<number>`count(*) filter (where ${auditLogs.action} = 'login')::int`,
        failed: sql<number>`count(*) filter (where ${auditLogs.action} = 'login_failed')::int`,
        actors: sql<number>`count(distinct ${auditLogs.actorUserId})::int`,
        actions: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(inWindow),

    db
      .select({ action: auditLogs.action, n: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.action)
      .orderBy(desc(sql`count(*)`)),

    // One row per IST calendar day in the window.
    db
      .select({
        day: sql<string>`(${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
        n: sql<number>`count(*)::int`,
        logins: sql<number>`count(*) filter (where ${auditLogs.action} = 'login')::int`,
        failed: sql<number>`count(*) filter (where ${auditLogs.action} = 'login_failed')::int`,
      })
      .from(auditLogs)
      .where(where)
      .groupBy(sql`(${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`)
      .orderBy(asc(sql`(${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`)),

    // Weekday x hour, for the heatmap. Both are IST, since that is the day a
    // reader means when they say "Tuesday morning".
    db
      .select({
        dow: sql<number>`extract(dow from ${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::int`,
        hour: sql<number>`extract(hour from ${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(where)
      .groupBy(sql`1`, sql`2`),

    // Grouped by the raw agent string, then folded into readable device names
    // in JS. Postgres could not do that folding without the regexes living in
    // SQL too, and one copy of them is the point of `./device`.
    db
      .select({ ua: auditLogs.userAgent, n: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where)
      .groupBy(auditLogs.userAgent),

    db
      .select({
        id: auditLogs.actorUserId,
        name: auditLogs.actorName,
        phone: auditLogs.actorPhone,
        n: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(and(where, sql`${auditLogs.actorUserId} is not null`))
      .groupBy(auditLogs.actorUserId, auditLogs.actorName, auditLogs.actorPhone)
      .orderBy(desc(sql`count(*)`))
      .limit(8),

    // Filter dropdown: everyone who has ever appeared in the log, not just in
    // this window — narrowing the options to the window makes the filter
    // unable to widen it again.
    db
      .selectDistinct({ id: auditLogs.actorUserId, name: auditLogs.actorName })
      .from(auditLogs)
      .where(sql`${auditLogs.actorUserId} is not null`)
      .orderBy(asc(auditLogs.actorName)),

    db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const rows = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorName: auditLogs.actorName,
      actorPhone: auditLogs.actorPhone,
      action: auditLogs.action,
      module: auditLogs.module,
      entityLabel: auditLogs.entityLabel,
      entityId: auditLogs.entityId,
      summary: auditLogs.summary,
      changes: auditLogs.changes,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
    })
    .from(auditLogs)
    .where(where)
    // Two events in the same millisecond would otherwise straddle a page
    // boundary unpredictably; the id makes the sort total.
    .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);

  // Many agent strings collapse to one device: every Chrome patch release is
  // its own user agent. Summed here so the chart shows five devices rather
  // than fifty near-identical strings.
  const deviceTotals = new Map<string, number>();
  for (const a of agents) {
    const label = deviceLabel(a.ua);
    deviceTotals.set(label, (deviceTotals.get(label) ?? 0) + a.n);
  }
  const byDevice = [...deviceTotals]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  return {
    last24: last24 ?? { logins: 0, failed: 0, actors: 0, actions: 0 },
    totals: totals ?? { logins: 0, failed: 0, actors: 0, actions: 0 },
    byAction,
    byDay,
    heatmap,
    byDevice,
    topUsers,
    actorOptions: actorOptions.filter((a) => a.id) as { id: string; name: string | null }[],
    rows: rows as AuditRow[],
    total,
    page,
    totalPages,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

export type UsageRow = {
  id: string | null;
  name: string | null;
  phone: string | null;
  roles: AccessRole[];
  sessions: number;
  actions: number;
  /** Sum over IST days of (last event − first event), in minutes. */
  activeMinutes: number;
  lastAt: Date;
};

/** One page of the usage table, plus the totals its caption reports — which
 * describe every active user in the window, not only this page. */
export type UsagePage = {
  rows: UsageRow[];
  users: number;
  totalMinutes: number;
  page: number;
  totalPages: number;
};

/**
 * Per-user usage for the "Usage & Time" tab.
 *
 * Active time is the sum, per IST day, of the span from that user's first
 * event to their last. It is a proxy and nothing more: this app records what
 * people DO, not a heartbeat, so a rep who logs in at 9 and files a visit at 5
 * reads as eight hours whether or not they put the phone down. It is the
 * honest version of the number: what the log can show, counted to the last
 * thing they actually did.
 */
export async function getUsage(window: AuditWindow, requestedPage = 1): Promise<UsagePage> {
  const active = and(
    gte(auditLogs.createdAt, window.start),
    lt(auditLogs.createdAt, window.end),
    sql`${auditLogs.actorUserId} is not null`,
  );

  const perDay = db
    .select({
      actorId: auditLogs.actorUserId,
      day: sql`(${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`.as("day"),
      span: sql`extract(epoch from (max(${auditLogs.createdAt}) - min(${auditLogs.createdAt})))`.as("span"),
    })
    .from(auditLogs)
    .where(active)
    .groupBy(auditLogs.actorUserId, sql`2`)
    .as("per_day");

  // Per-user active seconds, folded down from the per-day spans. A subquery
  // rather than a second round trip: the table is ordered by active time, so
  // the page cannot be chosen until this is joined in. Sorting in JS would
  // only sort whichever fifty rows Postgres happened to return.
  const spans = db
    .select({
      id: perDay.actorId,
      seconds: sql<number>`coalesce(sum(${perDay.span}), 0)::int`.as("seconds"),
    })
    .from(perDay)
    .groupBy(perDay.actorId)
    .as("spans");

  // One row per (actor, name, phone) — the same grouping the table renders, so
  // the count and the page count agree with what is on screen.
  const grouped = db
    .select({ id: auditLogs.actorUserId })
    .from(auditLogs)
    .where(active)
    .groupBy(auditLogs.actorUserId, auditLogs.actorName, auditLogs.actorPhone)
    .as("grouped");

  const [[counted], [minutes]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(grouped),
    // Summed the way the column displays it — each user rounded to the minute
    // first — so the caption equals the visible column added up.
    db
      .select({ n: sql<number>`coalesce(sum(round(${spans.seconds} / 60.0)), 0)::int` })
      .from(spans),
  ]);

  const activeUsers = counted?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(activeUsers / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const rows = await db
    .select({
      id: auditLogs.actorUserId,
      name: auditLogs.actorName,
      phone: auditLogs.actorPhone,
      roles: users.accessRoles,
      sessions: sql<number>`count(*) filter (where ${auditLogs.action} = 'login')::int`,
      actions: sql<number>`count(*)::int`,
      // max() of a value that is constant within the group: it keeps the
      // joined seconds out of GROUP BY without changing what it means.
      seconds: sql<number>`coalesce(max(${spans.seconds}), 0)::int`,
      // `.mapWith` is not decoration: drizzle-postgres-js overrides the
      // driver type parsers and rebuilds Dates from each COLUMN mapper, so a
      // bare `sql<Date>` aggregate arrives as a string and the type is simply
      // wrong. Borrowing the column mapper makes it a real Date.
      lastAt: sql<Date>`max(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt),
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(spans, eq(spans.id, auditLogs.actorUserId))
    .where(active)
    .groupBy(auditLogs.actorUserId, auditLogs.actorName, auditLogs.actorPhone, users.accessRoles)
    // Longest active time first, then busiest. The identity columns close the
    // order: without a total order, LIMIT/OFFSET can show one user twice and
    // skip another entirely between pages.
    .orderBy(
      desc(sql`coalesce(max(${spans.seconds}), 0)`),
      desc(sql`count(*)`),
      asc(auditLogs.actorUserId),
      asc(auditLogs.actorName),
    )
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      roles: (r.roles ?? []) as AccessRole[],
      sessions: r.sessions,
      actions: r.actions,
      activeMinutes: Math.round(r.seconds / 60),
      lastAt: r.lastAt,
    })),
    users: activeUsers,
    totalMinutes: minutes?.n ?? 0,
    page,
    totalPages,
  };
}

/** Users who have never appeared in the log still need to be pickable when the
 * admin is hunting for "did X do anything at all". */
export async function allUserOptions(): Promise<{ id: string; name: string }[]> {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
}
