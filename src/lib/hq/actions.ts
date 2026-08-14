"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { deleteFailure, insertFailure, type WriteResult } from "@/lib/db-errors";

/**
 * Regular hq users may only manage their own assigned C&F. Central Admin
 * can manage any C&F (they picked it via the C&F selector on the page).
 */
async function requireHqScope(cnfId: string) {
  const user = await getCurrentUser();
  const isAdmin = user?.accessRoles.includes("admin") ?? false;
  const hasHq = user?.accessRoles.includes("hq") ?? false;
  if (!user || (!hasHq && !isAdmin)) {
    throw new Error("You don't have C&F HQ access.");
  }
  if (!isAdmin && user.cnf?.id !== cnfId) {
    throw new Error("You can only manage your own C&F HQ.");
  }
}

export async function addDepot(cnfId: string, formData: FormData): Promise<WriteResult> {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a depot name." };

  // `onConflictDoNothing().returning()` gives back an empty array when the name
  // was already taken — previously that silently no-opped, so the admin clicked
  // Add and nothing happened with no explanation.
  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(depots)
      .values({ name, cnfId })
      .onConflictDoNothing()
      .returning({ id: depots.id });
  } catch (e) {
    return insertFailure(e, "depot");
  }
  if (inserted.length === 0) {
    return { ok: false, error: `A depot named "${name}" already exists.` };
  }

  revalidatePath("/hq/depots");
  return { ok: true };
}

export async function addArea(cnfId: string, formData: FormData): Promise<WriteResult> {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  const depotId = String(formData.get("depotId") ?? "");
  if (!name) return { ok: false, error: "Enter an area name." };
  if (!depotId) return { ok: false, error: "Pick a depot." };

  // Ensure the depot belongs to this C&F before adding an area under it.
  const [depot] = await db.select().from(depots).where(eq(depots.id, depotId)).limit(1);
  if (!depot || depot.cnfId !== cnfId) {
    return { ok: false, error: "That depot isn't in this C&F." };
  }

  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(areas)
      .values({ name, depotId })
      .onConflictDoNothing()
      .returning({ id: areas.id });
  } catch (e) {
    return insertFailure(e, "area");
  }
  // Area names are unique per depot, so this means "already in THIS depot".
  if (inserted.length === 0) {
    return { ok: false, error: `${depot.name} already has an area named "${name}".` };
  }

  revalidatePath("/hq/depots");
  return { ok: true };
}

export async function deleteArea(areaId: string): Promise<WriteResult> {
  const [area] = await db.select().from(areas).where(eq(areas.id, areaId)).limit(1);
  if (!area) return { ok: false, error: "Area not found." };
  const [depot] = await db.select().from(depots).where(eq(depots.id, area.depotId)).limit(1);
  if (!depot) return { ok: false, error: "Depot not found." };
  await requireHqScope(depot.cnfId);

  try {
    // Cascade: counters RESTRICT the area, and their visits/beat rows cascade
    // away with them. Matches the admin hierarchy behaviour.
    await db.transaction(async (tx) => {
      await tx.delete(counters).where(eq(counters.areaId, areaId));
      await tx.delete(areas).where(eq(areas.id, areaId));
    });
  } catch (e) {
    return deleteFailure(e, "area");
  }
  revalidatePath("/hq/depots");
  return { ok: true };
}

export async function deleteDepot(depotId: string): Promise<WriteResult> {
  const [depot] = await db.select().from(depots).where(eq(depots.id, depotId)).limit(1);
  if (!depot) return { ok: false, error: "Depot not found." };
  await requireHqScope(depot.cnfId);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(counters).where(eq(counters.depotId, depotId));
      await tx.delete(areas).where(eq(areas.depotId, depotId));
      await tx.delete(depots).where(eq(depots.id, depotId));
    });
  } catch (e) {
    return deleteFailure(e, "depot");
  }
  revalidatePath("/hq/depots");
  return { ok: true };
}
