"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accessRequests,
  areas,
  cnfs,
  depots,
  states,
  userAreas,
  userDepots,
  users,
  type AccessRole,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin } from "./guard";

function friendlyDeleteError(e: unknown, what: string): never {
  if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23503") {
    throw new Error(`Can't delete this ${what} — remove everything under it first.`);
  }
  throw e;
}

// ── Hierarchy: State → C&F HQ → Depot → Area ────────────────────────────

export async function addState(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || "India";
  if (!name) return;
  await db.insert(states).values({ name, country });
  revalidatePath("/admin/hierarchy");
}

export async function addCnf(stateId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !stateId) return;
  await db.insert(cnfs).values({ name, stateId });
  revalidatePath("/admin/hierarchy");
}

export async function addDepot(cnfId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !cnfId) return;
  await db.insert(depots).values({ name, cnfId });
  revalidatePath("/admin/hierarchy");
}

export async function addArea(depotId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !depotId) return;
  await db.insert(areas).values({ name, depotId });
  revalidatePath("/admin/hierarchy");
}

export async function deleteState(id: string) {
  await requireAdmin();
  try {
    await db.delete(states).where(eq(states.id, id));
  } catch (e) {
    friendlyDeleteError(e, "state");
  }
  revalidatePath("/admin/hierarchy");
}

export async function deleteCnf(id: string) {
  await requireAdmin();
  try {
    await db.delete(cnfs).where(eq(cnfs.id, id));
  } catch (e) {
    friendlyDeleteError(e, "C&F HQ");
  }
  revalidatePath("/admin/hierarchy");
}

export async function deleteDepot(id: string) {
  await requireAdmin();
  try {
    await db.delete(depots).where(eq(depots.id, id));
  } catch (e) {
    friendlyDeleteError(e, "depot");
  }
  revalidatePath("/admin/hierarchy");
}

export async function deleteArea(id: string) {
  await requireAdmin();
  try {
    await db.delete(areas).where(eq(areas.id, id));
  } catch (e) {
    friendlyDeleteError(e, "area");
  }
  revalidatePath("/admin/hierarchy");
}

// ── Users & access ───────────────────────────────────────────────────────

export async function addUser(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !/^\d{10}$/.test(phone)) return;

  // First login: password is the phone number, same as the field-rep bootstrap pattern.
  const passwordHash = await hashPassword(phone);
  await db
    .insert(users)
    .values({ name, phone, passwordHash, accessRoles: [] })
    .onConflictDoNothing({ target: users.phone });
  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) return; // can't remove yourself
  await db.delete(users).where(eq(users.id, userId));
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
