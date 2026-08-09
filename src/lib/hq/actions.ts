"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

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

function friendlyDeleteError(e: unknown, what: string): never {
  if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23503") {
    throw new Error(`Can't delete this ${what} — remove everything under it first.`);
  }
  throw e;
}

export async function addDepot(cnfId: string, formData: FormData) {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await db.insert(depots).values({ name, cnfId }).onConflictDoNothing();
  revalidatePath("/hq/depots");
}

export async function addArea(cnfId: string, formData: FormData) {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  const depotId = String(formData.get("depotId") ?? "");
  if (!name || !depotId) return;

  // Ensure the depot belongs to this C&F before adding an area under it.
  const [depot] = await db.select().from(depots).where(eq(depots.id, depotId)).limit(1);
  if (!depot || depot.cnfId !== cnfId) return;

  await db.insert(areas).values({ name, depotId }).onConflictDoNothing();
  revalidatePath("/hq/depots");
}

export async function deleteArea(areaId: string) {
  const [area] = await db.select().from(areas).where(eq(areas.id, areaId)).limit(1);
  if (!area) return;
  const [depot] = await db.select().from(depots).where(eq(depots.id, area.depotId)).limit(1);
  if (!depot) return;
  await requireHqScope(depot.cnfId);
  try {
    await db.delete(areas).where(eq(areas.id, areaId));
  } catch (e) {
    friendlyDeleteError(e, "area");
  }
  revalidatePath("/hq/depots");
}

export async function deleteDepot(depotId: string) {
  const [depot] = await db.select().from(depots).where(eq(depots.id, depotId)).limit(1);
  if (!depot) return;
  await requireHqScope(depot.cnfId);
  try {
    await db.delete(depots).where(eq(depots.id, depotId));
  } catch (e) {
    friendlyDeleteError(e, "depot");
  }
  revalidatePath("/hq/depots");
}
