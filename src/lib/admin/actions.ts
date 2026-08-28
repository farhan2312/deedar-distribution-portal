"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  accessRequests,
  areas,
  passwordResetRequests,
  cnfs,
  counters,
  stockists,
  states,
  userAreas,
  userStockists,
  users,
  visits,
  type AccessRole,
  type StockistKind,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { deleteFailure, insertFailure, type WriteResult } from "@/lib/db-errors";
import { requireAdmin } from "./guard";

// ── Hierarchy: State → C&F HQ → Depot → Area ────────────────────────────

/** Hierarchy actions RETURN failures instead of throwing (the convention used
 * across this codebase). A thrown error in a server action is unhandled: Next
 * renders its error screen and — in production — redacts the message entirely,
 * so a friendly "remove everything under it first" never reaches the admin.
 * Error→message mapping lives in `@/lib/db-errors`, shared with the HQ actions. */
export type HierarchyResult = WriteResult;

/** COUNT(*) for a table under a condition — used to name what blocks a delete. */
async function countWhere(table: PgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table).where(where);
  return row?.n ?? 0;
}

// ── Cascade deletes ─────────────────────────────────────────────────────
//
// Deleting a node removes everything beneath it. Only the RESTRICT edges have
// to be walked by hand (states←cnfs←stockists←{areas,counters}, areas←counters);
// everything under a counter — visits, beat assignments, scheme claims — is
// already ON DELETE CASCADE in the schema and goes automatically.
//
// USER ACCOUNTS ARE NEVER DELETED: users.depot_id / users.cnf_id are SET NULL,
// so a rep whose depot is removed simply becomes unassigned.

/** What a cascade delete would destroy — shown in the dialog before confirming. */
export type DeleteImpact = {
  cnfs: number;
  stockists: number;
  areas: number;
  counters: number;
  /** Visit history attached to those counters — the part that can't be re-created. */
  visits: number;
};

export type HierarchyKind = "state" | "cnf" | "depot" | "area";

/** Depot ids in scope for a node (empty for an area, which sits under one). */
async function depotIdsFor(kind: HierarchyKind, id: string): Promise<string[]> {
  if (kind === "depot") return [id];
  if (kind === "cnf") {
    const rows = await db.select({ id: stockists.id }).from(stockists).where(eq(stockists.cnfId, id));
    return rows.map((r) => r.id);
  }
  if (kind === "state") {
    const cnfRows = await db.select({ id: cnfs.id }).from(cnfs).where(eq(cnfs.stateId, id));
    if (cnfRows.length === 0) return [];
    const rows = await db
      .select({ id: stockists.id })
      .from(stockists)
      .where(inArray(stockists.cnfId, cnfRows.map((r) => r.id)));
    return rows.map((r) => r.id);
  }
  return [];
}

/**
 * Counts everything a delete would remove, so the confirmation can be specific
 * ("3 stockists, 12 areas, 47 counters and 210 visits") instead of a vague warning.
 */
export async function getDeleteImpact(kind: HierarchyKind, id: string): Promise<DeleteImpact> {
  // Not requireAdmin(): the C&F "Depots & Areas" screen shows this preview too,
  // and that page serves non-admin HQ users. They're scoped to their own C&F —
  // anything else reports zeros rather than leaking another C&F's structure.
  const user = await getCurrentUser();
  const empty: DeleteImpact = { cnfs: 0, stockists: 0, areas: 0, counters: 0, visits: 0 };
  if (!user) return empty;

  if (!user.accessRoles.includes("admin")) {
    if (!user.accessRoles.includes("hq") || !user.cnf) return empty;
    if (!(await isUnderCnf(kind, id, user.cnf.id))) return empty;
  }

  if (kind === "area") {
    const [counterCount, visitCount] = await Promise.all([
      countWhere(counters, eq(counters.areaId, id)),
      countVisitsWhere(eq(counters.areaId, id)),
    ]);
    return { cnfs: 0, stockists: 0, areas: 0, counters: counterCount, visits: visitCount };
  }

  const stockistIds = await depotIdsFor(kind, id);
  const cnfCount =
    kind === "state" ? await countWhere(cnfs, eq(cnfs.stateId, id)) : kind === "cnf" ? 1 : 0;

  if (stockistIds.length === 0) {
    return { cnfs: cnfCount, stockists: 0, areas: 0, counters: 0, visits: 0 };
  }

  const [areaCount, counterCount, visitCount] = await Promise.all([
    countWhere(areas, inArray(areas.stockistId, stockistIds)),
    countWhere(counters, inArray(counters.stockistId, stockistIds)),
    countVisitsWhere(inArray(counters.stockistId, stockistIds)),
  ]);

  return {
    cnfs: cnfCount,
    stockists: kind === "depot" ? 1 : stockistIds.length,
    areas: areaCount,
    counters: counterCount,
    visits: visitCount,
  };
}

/** Is this hierarchy node inside the given C&F? Gates the impact preview for
 * non-admin HQ users, who may only inspect their own structure. */
async function isUnderCnf(kind: HierarchyKind, id: string, cnfId: string): Promise<boolean> {
  if (kind === "cnf") return id === cnfId;
  if (kind === "depot") {
    const [d] = await db.select({ cnfId: stockists.cnfId }).from(stockists).where(eq(stockists.id, id)).limit(1);
    return d?.cnfId === cnfId;
  }
  if (kind === "area") {
    const [row] = await db
      .select({ cnfId: stockists.cnfId })
      .from(areas)
      .innerJoin(stockists, eq(stockists.id, areas.stockistId))
      .where(eq(areas.id, id))
      .limit(1);
    return row?.cnfId === cnfId;
  }
  return false; // a whole state is never in one C&F's remit
}

/** Visits attached to counters matching `where` — joined so we never have to
 * materialise a long list of counter ids. */
async function countVisitsWhere(where: SQL): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(where);
  return row?.n ?? 0;
}

/** Removes every counter + area under the given stockists, in FK-safe order. */
async function purgeDepots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  stockistIds: string[],
) {
  if (stockistIds.length === 0) return;
  // A dealer's sub-dealers go with it: parent_id RESTRICTs, so they would block
  // the delete, and a sub-dealer with no parent is not a thing this model
  // allows anyway.
  const children = await tx
    .select({ id: stockists.id })
    .from(stockists)
    .where(inArray(stockists.parentId, stockistIds));
  const all = [...new Set([...stockistIds, ...children.map((c) => c.id)])];

  // Counters first (areas RESTRICT on them), then areas.
  await tx.delete(counters).where(inArray(counters.stockistId, all));
  await tx.delete(areas).where(inArray(areas.stockistId, all));

  // Sub-dealers must go in their OWN statement, before their parents. A single
  // DELETE covering both can remove the dealer first — row order inside a
  // statement is not defined — and `parent_id` RESTRICTs, so that fails.
  const childIds = children.map((c) => c.id);
  if (childIds.length > 0) {
    await tx.delete(stockists).where(inArray(stockists.id, childIds));
  }
  await tx.delete(stockists).where(inArray(stockists.id, stockistIds));
}

export async function addState(formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || "India";
  if (!name) return { ok: false, error: "Enter a state name." };
  try {
    await db.insert(states).values({ name, country });
  } catch (e) {
    return insertFailure(e, "state");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function addCnf(stateId: string, formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a C&F HQ name." };
  if (!stateId) return { ok: false, error: "Pick a state." };

  // `cnfs.state_id` is UNIQUE — the model is one C&F HQ per state. Check first
  // so a second one gives this precise message rather than a bare "name already
  // exists" from the unique violation (which would be misleading).
  const [taken] = await db
    .select({ name: cnfs.name })
    .from(cnfs)
    .where(eq(cnfs.stateId, stateId))
    .limit(1);
  if (taken) {
    return { ok: false, error: `That state already has a C&F HQ (${taken.name}) — only one is allowed.` };
  }

  try {
    await db.insert(cnfs).values({ name, stateId });
  } catch (e) {
    return insertFailure(e, "C&F HQ");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

const STOCKIST_KINDS: StockistKind[] = ["depot", "dealer", "sub_dealer"];

const KIND_NOUN: Record<StockistKind, string> = {
  depot: "depot",
  dealer: "dealer",
  sub_dealer: "sub-dealer",
};

/**
 * Add a depot, a dealer, or a sub-dealer under a C&F.
 *
 * One action for all three because they are one table — the differences are
 * the `kind` label and, for a sub-dealer, the parent it must sit under. The
 * parent is re-checked here rather than trusted from the form: it has to be a
 * dealer (never a depot, never another sub-dealer — that is what keeps the
 * tier exactly one level deep) and it has to belong to the same C&F.
 */
export async function addStockist(cnfId: string, formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "depot");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;

  if (!STOCKIST_KINDS.includes(kindRaw as StockistKind)) {
    return { ok: false, error: "Unknown stockist type." };
  }
  const kind = kindRaw as StockistKind;
  if (!name) return { ok: false, error: `Enter a ${KIND_NOUN[kind]} name.` };
  if (!cnfId) return { ok: false, error: "Missing C&F HQ." };

  if (kind === "sub_dealer") {
    if (!parentId) return { ok: false, error: "Pick the dealer this sub-dealer sits under." };
    const [parent] = await db
      .select({ id: stockists.id, kind: stockists.kind, cnfId: stockists.cnfId })
      .from(stockists)
      .where(eq(stockists.id, parentId))
      .limit(1);
    if (!parent) return { ok: false, error: "That dealer no longer exists." };
    if (parent.kind !== "dealer") {
      return { ok: false, error: "A sub-dealer can only sit under a dealer." };
    }
    if (parent.cnfId !== cnfId) {
      return { ok: false, error: "That dealer belongs to a different C&F." };
    }
  } else if (parentId) {
    return { ok: false, error: `A ${KIND_NOUN[kind]} has no parent.` };
  }

  try {
    await db.insert(stockists).values({
      name,
      cnfId,
      kind,
      parentId: kind === "sub_dealer" ? parentId : null,
    });
  } catch (e) {
    return insertFailure(e, KIND_NOUN[kind]);
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function addArea(stockistId: string, formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter an area name." };
  if (!stockistId) return { ok: false, error: "Missing depot." };
  try {
    await db.insert(areas).values({ name, stockistId });
  } catch (e) {
    return insertFailure(e, "area");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function deleteState(id: string): Promise<HierarchyResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      const cnfRows = await tx.select({ id: cnfs.id }).from(cnfs).where(eq(cnfs.stateId, id));
      const cnfIds = cnfRows.map((r) => r.id);
      if (cnfIds.length > 0) {
        const stockistRows = await tx
          .select({ id: stockists.id })
          .from(stockists)
          .where(inArray(stockists.cnfId, cnfIds));
        await purgeDepots(tx, stockistRows.map((r) => r.id));
        await tx.delete(cnfs).where(inArray(cnfs.id, cnfIds));
      }
      await tx.delete(states).where(eq(states.id, id));
    });
  } catch (e) {
    return deleteFailure(e, "state");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function deleteCnf(id: string): Promise<HierarchyResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      const stockistRows = await tx.select({ id: stockists.id }).from(stockists).where(eq(stockists.cnfId, id));
      await purgeDepots(tx, stockistRows.map((r) => r.id));
      await tx.delete(cnfs).where(eq(cnfs.id, id));
    });
  } catch (e) {
    return deleteFailure(e, "C&F HQ");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

/** Delete a depot, dealer or sub-dealer — and, for a dealer, its sub-dealers
 * along with everything beneath them. */
export async function deleteStockist(id: string): Promise<HierarchyResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      await purgeDepots(tx, [id]);
    });
  } catch (e) {
    return deleteFailure(e, "stockist");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function deleteArea(id: string): Promise<HierarchyResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      // Counters RESTRICT the area, so they go first; their visits/beat rows
      // cascade away with them.
      await tx.delete(counters).where(eq(counters.areaId, id));
      await tx.delete(areas).where(eq(areas.id, id));
    });
  } catch (e) {
    return deleteFailure(e, "area");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

// ── Users & access ───────────────────────────────────────────────────────

export type AddUserResult = { ok: true; message: string } | { ok: false; message: string };

export async function addUser(formData: FormData): Promise<AddUserResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !/^\d{10}$/.test(phone)) {
    return { ok: false, message: "Enter a name and a valid 10-digit mobile number." };
  }

  // First login: password is the phone number, same as the field-rep bootstrap
  // pattern — so force a reset before they can use the app (mustChangePassword).
  const passwordHash = await hashPassword(phone);
  const inserted = await db
    .insert(users)
    .values({ name, phone, passwordHash, accessRoles: [], mustChangePassword: true })
    .onConflictDoNothing({ target: users.phone })
    .returning({ id: users.id });

  // No row back ⇒ the phone was already taken (conflict target skipped the insert).
  if (inserted.length === 0) {
    return { ok: false, message: `A user with mobile ${phone} already exists.` };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${name} added — password is their mobile number until first login. Assign access below.` };
}


// ── User edit + password ────────────────────────────────────────────────

export type UserEditResult = { ok: true; message: string } | { ok: false; message: string };

/** Edit a user's name and mobile number. The mobile is also their login id, so
 * changing it changes how they sign in — and it must stay unique. */
export async function updateUser(userId: string, formData: FormData): Promise<UserEditResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !/^d{10}$/.test(phone)) {
    return { ok: false, message: "Enter a name and a valid 10-digit mobile number." };
  }

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  if (clash && clash.id !== userId) {
    return { ok: false, message: `Another user already uses mobile ${phone}.` };
  }

  await db.update(users).set({ name, phone, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/admin/users");
  return { ok: true, message: `${name} updated.` };
}

/**
 * Reset a user's password to their mobile number.
 *
 * Same bootstrap convention as `addUser`, and it always sets
 * `mustChangePassword` — a password anyone who knows the number can guess is
 * only acceptable as a one-time handover, never as a resting state.
 */
export async function resetUserPassword(userId: string): Promise<UserEditResult> {
  const admin = await requireAdmin();

  const [user] = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, message: "That user no longer exists." };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(user.phone),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Close any open request for this number — the reason it was raised is gone.
  await db
    .update(passwordResetRequests)
    .set({ status: "done", resolvedByUserId: admin.id, resolvedAt: new Date() })
    .where(
      and(eq(passwordResetRequests.phone, user.phone), eq(passwordResetRequests.status, "pending")),
    );

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `${user.name}'s password is now their mobile number. They must change it at next login.`,
  };
}

/** Close a reset request without touching the account — for a number nobody
 * recognises, or one already sorted out in person. */
export async function dismissPasswordReset(requestId: string) {
  const admin = await requireAdmin();
  await db
    .update(passwordResetRequests)
    .set({ status: "dismissed", resolvedByUserId: admin.id, resolvedAt: new Date() })
    .where(eq(passwordResetRequests.id, requestId));
  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) return; // can't remove yourself
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

/**
 * Soft-disable a user without deleting them. Deleting a rep cascades away all
 * their visits (their entire sales history) — deactivation keeps everything but
 * blocks login and treats them as logged-out on their next request. Reversible.
 */
export async function setUserActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  if (admin.id === userId) return; // can't deactivate yourself
  await db
    .update(users)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

export async function toggleAccessRole(userId: string, role: AccessRole) {
  await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  const isActive = user.accessRoles.includes(role);
  const nextRoles = isActive
    ? user.accessRoles.filter((r) => r !== role)
    : [...user.accessRoles, role];

  await db
    .update(users)
    .set({ accessRoles: nextRoles, updatedAt: new Date() })
    .where(eq(users.id, userId));

  if (isActive) {
    // Role was removed — clear scope data that's no longer meaningful.
    if (role === "hq") {
      await db.update(users).set({ cnfId: null }).where(eq(users.id, userId));
    }
    // field, depot and dealer all scope to the same single stockist, so the
    // link is only cleared once NONE of them is left.
    const stockistRoles: AccessRole[] = ["field", "depot", "dealer"];
    if (role === "field") {
      await db.delete(userAreas).where(eq(userAreas.userId, userId));
    }
    if (stockistRoles.includes(role) && !stockistRoles.some((r) => nextRoles.includes(r))) {
      await db.update(users).set({ stockistId: null }).where(eq(users.id, userId));
    }
    if (role === "supervisor") {
      await db.delete(userStockists).where(eq(userStockists.userId, userId));
    }
  }

  revalidatePath("/admin/users");
}

/** Single-scope: field, depot and dealer share one stockist per user. */
export async function setUserDepot(userId: string, formData: FormData) {
  await requireAdmin();
  const stockistId = String(formData.get("depotId") ?? "");
  if (!stockistId) return;
  await db.update(users).set({ stockistId, updatedAt: new Date() }).where(eq(users.id, userId));
  // Depot changed — previously-picked areas belonged to the old depot.
  await db.delete(userAreas).where(eq(userAreas.userId, userId));
  revalidatePath("/admin/users");
}

/** Single-scope: hq → which C&F HQ this rep belongs to. */
export async function setUserCnf(userId: string, formData: FormData) {
  await requireAdmin();
  const cnfId = String(formData.get("cnfId") ?? "");
  if (!cnfId) return;
  await db.update(users).set({ cnfId, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

/** Field rep → which Supervisor (SO) they report to. */
export async function setUserReportsTo(userId: string, formData: FormData) {
  await requireAdmin();
  const reportsToUserId = String(formData.get("reportsToUserId") ?? "") || null;
  await db
    .update(users)
    .set({ reportsToUserId, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

/** Multi-scope: field → which areas (within their one depot) they cover. */
export async function toggleUserArea(userId: string, areaId: string) {
  await requireAdmin();
  const existing = await db
    .select()
    .from(userAreas)
    .where(and(eq(userAreas.userId, userId), eq(userAreas.areaId, areaId)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(userAreas)
      .where(and(eq(userAreas.userId, userId), eq(userAreas.areaId, areaId)));
  } else {
    await db.insert(userAreas).values({ userId, areaId });
  }
  revalidatePath("/admin/users");
}

// ── Access requests (public "Request Access" signup) ────────────────────

/** Approve a pending request — creates the real `users` row and hands them
 * the requested role. If the phone got taken between request and review
 * (e.g. an admin added them manually), the request is auto-rejected instead. */
export async function approveAccessRequest(requestId: string) {
  const admin = await requireAdmin();
  const [request] = await db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")))
    .limit(1);
  if (!request) return;

  const inserted = await db
    .insert(users)
    .values({
      name: request.name,
      phone: request.phone,
      passwordHash: request.passwordHash,
      accessRoles: [request.requestedRole],
    })
    .onConflictDoNothing({ target: users.phone })
    .returning({ id: users.id });

  await db
    .update(accessRequests)
    .set({
      status: inserted.length > 0 ? "approved" : "rejected",
      reviewedByUserId: admin.id,
      reviewedAt: new Date(),
    })
    .where(eq(accessRequests.id, requestId));

  revalidatePath("/admin/users");
}

export async function rejectAccessRequest(requestId: string) {
  const admin = await requireAdmin();
  await db
    .update(accessRequests)
    .set({ status: "rejected", reviewedByUserId: admin.id, reviewedAt: new Date() })
    .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")));
  revalidatePath("/admin/users");
}

/** Multi-scope: supervisor → which stockists they oversee. */
export async function toggleUserDepot(userId: string, stockistId: string) {
  await requireAdmin();
  const existing = await db
    .select()
    .from(userStockists)
    .where(and(eq(userStockists.userId, userId), eq(userStockists.stockistId, stockistId)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(userStockists)
      .where(and(eq(userStockists.userId, userId), eq(userStockists.stockistId, stockistId)));
  } else {
    await db.insert(userStockists).values({ userId, stockistId });
  }
  revalidatePath("/admin/users");
}
