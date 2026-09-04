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

/** Rows per page in the activity table. */
export const AUDIT_PAGE_SIZE = 25;

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
export async function getUsage(window: AuditWindow): Promise<UsageRow[]> {
  const perDay = db
    .select({
      actorId: auditLogs.actorUserId,
      day: sql`(${auditLogs.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`.as("day"),
      span: sql`extract(epoch from (max(${auditLogs.createdAt}) - min(${auditLogs.createdAt})))`.as("span"),
    })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, window.start),
        lt(auditLogs.createdAt, window.end),
        sql`${auditLogs.actorUserId} is not null`,
      ),
    )
    .groupBy(auditLogs.actorUserId, sql`2`)
    .as("per_day");

  const [totals, spans] = await Promise.all([
    db
      .select({
        id: auditLogs.actorUserId,
        name: auditLogs.actorName,
        phone: auditLogs.actorPhone,
        roles: users.accessRoles,
        sessions: sql<number>`count(*) filter (where ${auditLogs.action} = 'login')::int`,
        actions: sql<number>`count(*)::int`,
        // `.mapWith` is not decoration: drizzle-postgres-js overrides the
        // driver's type parsers and rebuilds Dates from each COLUMN's mapper,
        // so a bare `sql<Date>` aggregate arrives as a string and the type is
        // simply wrong. Borrowing the column's mapper makes it a real Date.
        lastAt: sql<Date>`max(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt),
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(
        and(
          gte(auditLogs.createdAt, window.start),
          lt(auditLogs.createdAt, window.end),
          sql`${auditLogs.actorUserId} is not null`,
        ),
      )
      .groupBy(auditLogs.actorUserId, auditLogs.actorName, auditLogs.actorPhone, users.accessRoles),

    db
      .select({
        id: perDay.actorId,
        seconds: sql<number>`coalesce(sum(${perDay.span}), 0)::int`,
      })
      .from(perDay)
      .groupBy(perDay.actorId),
  ]);

  const secondsBy = new Map(spans.map((r) => [r.id, r.seconds]));
  return totals
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      roles: (r.roles ?? []) as AccessRole[],
      sessions: r.sessions,
      actions: r.actions,
      activeMinutes: Math.round((secondsBy.get(r.id) ?? 0) / 60),
      lastAt: r.lastAt,
    }))
    .sort((a, b) => b.activeMinutes - a.activeMinutes || b.actions - a.actions);
}

/** Users who have never appeared in the log still need to be pickable when the
 * admin is hunting for "did X do anything at all". */
export async function allUserOptions(): Promise<{ id: string; name: string }[]> {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
}
