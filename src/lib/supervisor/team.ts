import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import type { AccessRole, DayLog } from "@/db/schema";
import { areas, beatAssignments, counters, dayLogs, stockists, users, visits } from "@/db/schema";

/** The subset of the current user needed to scope a supervisor's team. */
export type ScopeUser = {
  id: string;
  accessRoles: AccessRole[];
  depot: { id: string; name: string } | null;
  supervisedStockists: { id: string; name: string }[];
};

export type StockistOption = { id: string; name: string };

export type TeamRep = {
  id: string;
  name: string;
  phone: string;
  stockistId: string | null;
  stockistName: string | null;
};

export type VisitsToday = {
  count: number;
  counters: number; // distinct counters visited today
  last: {
    counterId: string;
    counterName: string;
    area: string;
    lat: string | null;
    lng: string | null;
    visitedAt: Date;
  } | null;
};

/** Depots a supervisor can look at (their own + supervised), deduped by id. */
export function scopeStockists(user: ScopeUser): StockistOption[] {
  const byId = new Map<string, StockistOption>();
  for (const d of user.supervisedStockists) byId.set(d.id, d);
  if (user.depot) byId.set(user.depot.id, user.depot);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The stockists in scope for a screen's depot selector. Admin is unrestricted, so
 * it gets every depot; a supervisor gets their own + supervised stockists.
 */
export async function getScopeStockists(user: ScopeUser): Promise<StockistOption[]> {
  if (user.accessRoles.includes("admin")) {
    return db.select({ id: stockists.id, name: stockists.name }).from(stockists).orderBy(asc(stockists.name));
  }
  return scopeStockists(user);
}

/**
 * Resolve which depot is being viewed from the `?depot=` param against the
 * in-scope list. Returns `null` for "all stockists" or an unknown/out-of-scope id.
 */
export function pickStockist(stockists: StockistOption[], requested: string | undefined): StockistOption | null {
  if (!requested || requested === "all") return null;
  return stockists.find((d) => d.id === requested) ?? null;
}

/**
 * Field reps under this supervisor: those whose `reportsToUserId` is the SO.
 * Admins see every field rep. Optionally narrowed to one depot.
 */
export async function getTeamReps(user: ScopeUser, stockistId?: string | null): Promise<TeamRep[]> {
  const isAdmin = user.accessRoles.includes("admin");
  const base = isAdmin
    ? sql`'field' = ANY(${users.accessRoles}::text[])`
    : eq(users.reportsToUserId, user.id);
  const where = stockistId ? and(base, eq(users.stockistId, stockistId)) : base;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      accessRoles: users.accessRoles,
      stockistId: users.stockistId,
      stockistName: stockists.name,
    })
    .from(users)
    .leftJoin(stockists, eq(stockists.id, users.stockistId))
    .where(where);

  return rows
    .filter((r) => r.accessRoles.includes("field"))
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone, stockistId: r.stockistId, stockistName: r.stockistName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Each rep's day_log row for the given IST date, keyed by userId. */
export async function getTeamDayLogs(repIds: string[], logDate: string): Promise<Map<string, DayLog>> {
  if (repIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(dayLogs)
    .where(and(inArray(dayLogs.userId, repIds), eq(dayLogs.logDate, logDate)));
  return new Map(rows.map((r) => [r.userId, r]));
}

/**
 * Per-rep visit activity within a UTC window (an IST day). Includes the most
 * recent visit's counter — used as the rep's approximate last-seen location on
 * the map (we don't track live GPS; a visit is the closest real signal).
 */
export async function getVisitsToday(
  repIds: string[],
  bounds: { start: Date; end: Date },
): Promise<Map<string, VisitsToday>> {
  if (repIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: visits.userId,
      visitedAt: visits.visitedAt,
      counterId: visits.counterId,
      counterName: counters.name,
      area: areas.name,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(
      and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)),
    )
    .orderBy(desc(visits.visitedAt));

  const out = new Map<string, VisitsToday>();
  const seenCounters = new Map<string, Set<string>>();
  for (const r of rows) {
    let agg = out.get(r.userId);
    if (!agg) {
      agg = { count: 0, counters: 0, last: null };
      out.set(r.userId, agg);
      seenCounters.set(r.userId, new Set());
    }
    agg.count += 1;
    seenCounters.get(r.userId)!.add(r.counterId);
    // rows are newest-first, so the first row per user is the latest visit.
    if (!agg.last) {
      agg.last = {
        counterId: r.counterId,
        counterName: r.counterName,
        area: r.area,
        lat: r.lat,
        lng: r.lng,
        visitedAt: r.visitedAt,
      };
    }
  }
  for (const [userId, set] of seenCounters) out.get(userId)!.counters = set.size;
  return out;
}

/**
 * Total stock observed at each counter's MOST RECENT visit (any rep, any
 * date). Counters never visited are absent from the map — callers default
 * them to 0.
 */
export async function getLatestVisitStock(counterIds: string[]): Promise<Map<string, number>> {
  if (counterIds.length === 0) return new Map();
  const rows = await db
    .select({ counterId: visits.counterId, stock: visits.stock })
    .from(visits)
    .where(inArray(visits.counterId, counterIds))
    .orderBy(desc(visits.visitedAt));

  const out = new Map<string, number>();
  for (const r of rows) if (!out.has(r.counterId)) out.set(r.counterId, r.stock); // newest-first
  return out;
}

/** Distinct counter ids the team visited within the window (map coloring + coverage KPI). */
export async function getCountersVisitedToday(
  repIds: string[],
  bounds: { start: Date; end: Date },
): Promise<Set<string>> {
  if (repIds.length === 0) return new Set();
  const rows = await db
    .select({ counterId: visits.counterId })
    .from(visits)
    .where(
      and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)),
    );
  return new Set(rows.map((r) => r.counterId));
}

/**
 * Counters a Supervisor has put on a rep's beat for the given IST day. Keyed by
 * counter id (not rep) — the map only cares whether a counter is assigned today,
 * not to whom. `counterIds` bounds the query to the counters actually on screen.
 */
export async function getCountersAssignedToday(
  counterIds: string[],
  logDate: string,
): Promise<Set<string>> {
  if (counterIds.length === 0) return new Set();
  const rows = await db
    .select({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .where(
      and(inArray(beatAssignments.counterId, counterIds), eq(beatAssignments.beatDate, logDate)),
    );
  return new Set(rows.map((r) => r.counterId));
}
