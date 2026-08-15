"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  accessRequests,
  areas,
  cnfs,
  counters,
  depots,
  states,
  userAreas,
  userDepots,
  users,
  visits,
  type AccessRole,
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
// to be walked by hand (states←cnfs←depots←{areas,counters}, areas←counters);
// everything under a counter — visits, beat assignments, scheme claims — is
// already ON DELETE CASCADE in the schema and goes automatically.
//
// USER ACCOUNTS ARE NEVER DELETED: users.depot_id / users.cnf_id are SET NULL,
// so a rep whose depot is removed simply becomes unassigned.

/** What a cascade delete would destroy — shown in the dialog before confirming. */
export type DeleteImpact = {
  cnfs: number;
  depots: number;
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
    const rows = await db.select({ id: depots.id }).from(depots).where(eq(depots.cnfId, id));
    return rows.map((r) => r.id);
  }
  if (kind === "state") {
    const cnfRows = await db.select({ id: cnfs.id }).from(cnfs).where(eq(cnfs.stateId, id));
    if (cnfRows.length === 0) return [];
    const rows = await db
      .select({ id: depots.id })
      .from(depots)
      .where(inArray(depots.cnfId, cnfRows.map((r) => r.id)));
    return rows.map((r) => r.id);
  }
  return [];
}

/**
 * Counts everything a delete would remove, so the confirmation can be specific
 * ("3 depots, 12 areas, 47 counters and 210 visits") instead of a vague warning.
 */
export async function getDeleteImpact(kind: HierarchyKind, id: string): Promise<DeleteImpact> {
  // Not requireAdmin(): the C&F "Depots & Areas" screen shows this preview too,
  // and that page serves non-admin HQ users. They're scoped to their own C&F —
  // anything else reports zeros rather than leaking another C&F's structure.
  const user = await getCurrentUser();
  const empty: DeleteImpact = { cnfs: 0, depots: 0, areas: 0, counters: 0, visits: 0 };
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
    return { cnfs: 0, depots: 0, areas: 0, counters: counterCount, visits: visitCount };
  }

  const depotIds = await depotIdsFor(kind, id);
  const cnfCount =
    kind === "state" ? await countWhere(cnfs, eq(cnfs.stateId, id)) : kind === "cnf" ? 1 : 0;

  if (depotIds.length === 0) {
    return { cnfs: cnfCount, depots: 0, areas: 0, counters: 0, visits: 0 };
  }

  const [areaCount, counterCount, visitCount] = await Promise.all([
    countWhere(areas, inArray(areas.depotId, depotIds)),
    countWhere(counters, inArray(counters.depotId, depotIds)),
    countVisitsWhere(inArray(counters.depotId, depotIds)),
  ]);

  return {
    cnfs: cnfCount,
    depots: kind === "depot" ? 1 : depotIds.length,
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
    const [d] = await db.select({ cnfId: depots.cnfId }).from(depots).where(eq(depots.id, id)).limit(1);
    return d?.cnfId === cnfId;
  }
  if (kind === "area") {
    const [row] = await db
      .select({ cnfId: depots.cnfId })
      .from(areas)
      .innerJoin(depots, eq(depots.id, areas.depotId))
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

/** Removes every counter + area under the given depots, in FK-safe order. */
async function purgeDepots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  depotIds: string[],
) {
  if (depotIds.length === 0) return;
  // Counters first (areas RESTRICT on them), then areas, then the depots.
  await tx.delete(counters).where(inArray(counters.depotId, depotIds));
  await tx.delete(areas).where(inArray(areas.depotId, depotIds));
  await tx.delete(depots).where(inArray(depots.id, depotIds));
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

export async function addDepot(cnfId: string, formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a depot name." };
  if (!cnfId) return { ok: false, error: "Missing C&F HQ." };
  try {
    await db.insert(depots).values({ name, cnfId });
  } catch (e) {
    return insertFailure(e, "depot");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function addArea(depotId: string, formData: FormData): Promise<HierarchyResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter an area name." };
  if (!depotId) return { ok: false, error: "Missing depot." };
  try {
    await db.insert(areas).values({ name, depotId });
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
        const depotRows = await tx
          .select({ id: depots.id })
          .from(depots)
          .where(inArray(depots.cnfId, cnfIds));
        await purgeDepots(tx, depotRows.map((r) => r.id));
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
      const depotRows = await tx.select({ id: depots.id }).from(depots).where(eq(depots.cnfId, id));
      await purgeDepots(tx, depotRows.map((r) => r.id));
      await tx.delete(cnfs).where(eq(cnfs.id, id));
    });
  } catch (e) {
    return deleteFailure(e, "C&F HQ");
  }
  revalidatePath("/admin/hierarchy");
  return { ok: true };
}

export async function deleteDepot(id: string): Promise<HierarchyResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      await purgeDepots(tx, [id]);
    });
  } catch (e) {
    return deleteFailure(e, "depot");
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
    if (role === "field") {
      await db.delete(userAreas).where(eq(userAreas.userId, userId));
      if (!nextRoles.includes("dealer")) {
        await db.update(users).set({ depotId: null }).where(eq(users.id, userId));
      }
    }
    if (role === "dealer" && !nextRoles.includes("field")) {
      await db.update(users).set({ depotId: null }).where(eq(users.id, userId));
    }
    if (role === "supervisor") {
      await db.delete(userDepots).where(eq(userDepots.userId, userId));
    }
  }

  revalidatePath("/admin/users");
}

/** Single-scope: dealer/field share one depot per user. */
export async function setUserDepot(userId: string, formData: FormData) {
  await requireAdmin();
  const depotId = String(formData.get("depotId") ?? "");
  if (!depotId) return;
  await db.update(users).set({ depotId, updatedAt: new Date() }).where(eq(users.id, userId));
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

/** Multi-scope: supervisor → which depots they oversee. */
export async function toggleUserDepot(userId: string, depotId: string) {
  await requireAdmin();
  const existing = await db
    .select()
    .from(userDepots)
    .where(and(eq(userDepots.userId, userId), eq(userDepots.depotId, depotId)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(userDepots)
      .where(and(eq(userDepots.userId, userId), eq(userDepots.depotId, depotId)));
  } else {
    await db.insert(userDepots).values({ userId, depotId });
  }
  revalidatePath("/admin/users");
}
