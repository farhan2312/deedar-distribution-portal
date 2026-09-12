import "server-only";
import { and, asc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { stockists, userAreas, userStockists, users, type AccessRole } from "@/db/schema";

/**
 * One page of Users & Access, resolved in SQL.
 *
 * The screen used to load every user, every area and both join tables, then
 * filter by toggling `hidden` on rendered rows. That means the search only ever
 * saw what was already on screen — fine at 23 users, wrong the moment the list
 * is longer than the page. Search, the C&F filter and the page are query params
 * now, so all three happen in Postgres and the answer covers everyone.
 */

/** Rows per page. Lower than the counters lists (50) because a user row is
 * seven role checkboxes and a mapping cell, not a line of text. */
export const USERS_PAGE_SIZE = 25;

export type UsersListParams = { q?: string; cnf?: string; page?: string };

/** The short row the deactivated panel renders: who they were, and nothing
 * that only applies to an account which can still sign in. */
export type DeactivatedUser = {
  id: string;
  name: string;
  phone: string;
  accessRoles: AccessRole[];
};

/** A user row plus the name of whoever added them — null for accounts that
 * predate the column, and for a creator who has since been deleted. */
export type UserRow = typeof users.$inferSelect & { createdByName: string | null };

export type UsersPage = {
  rows: UserRow[];
  /** Users matching the filters, across every page. */
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  filters: { q: string; cnfId: string | null };
  /** Unfiltered head-count for the stat cards — those answer "how big is the
   * system", which a search box shouldn't change. */
  totalUsers: number;
  activeUsers: number;
};

/**
 * A user belongs to a C&F by one of three different routes, so the filter has
 * to test all three:
 *   • hq            → users.cnf_id directly
 *   • field/dealer  → the C&F of users.stockist_id
 *   • supervisor    → the C&F of any stockist in user_stockists (can be several)
 * Admin and Kanpur HQ are cross-C&F and belong to none, so they drop out of a
 * specific C&F's list — same as the old client-side filter did.
 */
function inCnf(cnfId: string): SQL {
  return or(
    eq(users.cnfId, cnfId),
    sql`exists (select 1 from ${stockists} s
                where s.id = ${users.stockistId} and s.cnf_id = ${cnfId})`,
    sql`exists (select 1 from ${userStockists} us
                join ${stockists} s2 on s2.id = us.stockist_id
                where us.user_id = ${users.id} and s2.cnf_id = ${cnfId})`,
  )!;
}

/**
 * The C&F and search predicates, shared by the two lists on the page.
 *
 * Both have to answer the same search: the deactivated panel is the only place
 * a disabled account appears now, so a search that reached only the main table
 * would report "no such user" for someone who is right there in the database —
 * and the next thing the admin does is re-add a mobile number that is already
 * taken, which fails with an error naming nothing.
 */
function userFilters(params: UsersListParams, cnfIds: string[]) {
  const cnfId = cnfIds.includes(params.cnf ?? "") ? (params.cnf as string) : null;
  const q = (params.q ?? "").trim();

  const parts: SQL[] = [];
  if (cnfId) parts.push(inCnf(cnfId));
  if (q) {
    const like = `%${q}%`;
    parts.push(or(ilike(users.name, like), ilike(users.phone, like))!);
  }
  return { cnfId, q, parts };
}

/**
 * Deactivated accounts, for the panel under the main table.
 *
 * Not paged: this is a short list by nature, and the panel scrolls inside a
 * fixed height rather than growing the page. It is capped all the same, so a
 * company with years of ex-staff cannot turn one render into a thousand rows.
 */
export async function fetchDeactivatedUsers(
  params: UsersListParams,
  cnfIds: string[],
): Promise<{ rows: DeactivatedUser[]; total: number }> {
  const { parts } = userFilters(params, cnfIds);
  const filter = and(eq(users.isActive, false), ...parts);

  const [[{ n: total }], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(filter),
    db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        accessRoles: users.accessRoles,
      })
      .from(users)
      .where(filter)
      .orderBy(asc(users.name), asc(users.id))
      .limit(DEACTIVATED_CAP),
  ]);

  return { rows: rows as DeactivatedUser[], total };
}

/** Most rows the deactivated panel will render at once. */
export const DEACTIVATED_CAP = 100;

export async function fetchUsersPage(
  params: UsersListParams,
  /** Valid C&F ids, so a stale `?cnf=` is dropped rather than hiding everyone. */
  cnfIds: string[],
): Promise<UsersPage> {
  const { cnfId, q, parts } = userFilters(params, cnfIds);
  // Deactivated accounts have their own panel. Keeping them here too would
  // spend slots in a 25-row page on people who cannot sign in, and offer role
  // checkboxes and a password reset that do nothing for them.
  const filter = and(eq(users.isActive, true), ...parts);

  const [[counts], [{ n: total }]] = await Promise.all([
    db
      .select({
        all: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${users.isActive})::int`,
      })
      .from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  // Clamped: a filter that shrinks the result can leave the URL on page 7 of 2.
  const requested = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const page = Math.min(requested, totalPages);

  // Self-join for the creator's name: one query instead of a lookup per row.
  const creator = alias(users, "created_by");
  const rows = await db
    .select({ ...getTableColumns(users), createdByName: creator.name })
    .from(users)
    .leftJoin(creator, eq(creator.id, users.createdByUserId))
    .where(filter)
    // Names are not unique, and LIMIT/OFFSET over a non-total order drops and
    // repeats rows across page boundaries — the id makes the sort total.
    .orderBy(asc(users.name), asc(users.id))
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE);

  return {
    rows,
    total,
    page,
    totalPages,
    pageSize: USERS_PAGE_SIZE,
    filters: { q, cnfId },
    totalUsers: counts?.all ?? 0,
    activeUsers: counts?.active ?? 0,
  };
}

/** Every supervisor, for the "reports to" dropdown — that list has to cover
 * the whole system, not just whoever landed on this page. */
export async function fetchSupervisorOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`'supervisor' = ANY(${users.accessRoles}::text[])`)
    .orderBy(asc(users.name));
}

/** Area and stockist assignments for just the users on screen. */
export async function fetchAssignmentsFor(userIds: string[]): Promise<{
  areasByUser: Map<string, Set<string>>;
  stockistsByUser: Map<string, Set<string>>;
}> {
  const areasByUser = new Map<string, Set<string>>();
  const stockistsByUser = new Map<string, Set<string>>();
  if (userIds.length === 0) return { areasByUser, stockistsByUser };

  const [areaRows, stockistRows] = await Promise.all([
    db.select().from(userAreas).where(inArray(userAreas.userId, userIds)),
    db.select().from(userStockists).where(inArray(userStockists.userId, userIds)),
  ]);
  for (const r of areaRows) {
    if (!areasByUser.has(r.userId)) areasByUser.set(r.userId, new Set());
    areasByUser.get(r.userId)!.add(r.areaId);
  }
  for (const r of stockistRows) {
    if (!stockistsByUser.has(r.userId)) stockistsByUser.set(r.userId, new Set());
    stockistsByUser.get(r.userId)!.add(r.stockistId);
  }
  return { areasByUser, stockistsByUser };
}
