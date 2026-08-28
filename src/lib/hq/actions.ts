"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists, type StockistKind } from "@/db/schema";
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

const KIND_NOUN: Record<StockistKind, string> = {
  depot: "depot",
  dealer: "dealer",
  sub_dealer: "sub-dealer",
};

/**
 * Add a depot, dealer or sub-dealer to this C&F.
 *
 * Same shape as the admin version, scoped to the caller's own C&F. The parent
 * is re-checked here rather than trusted from the form: it must be a dealer,
 * and it must belong to this C&F — otherwise a hand-posted form could hang a
 * sub-dealer under someone else's structure.
 */
export async function addStockist(cnfId: string, formData: FormData): Promise<WriteResult> {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "depot");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;

  const KINDS: StockistKind[] = ["depot", "dealer", "sub_dealer"];
  if (!KINDS.includes(kindRaw as StockistKind)) {
    return { ok: false, error: "Unknown stockist type." };
  }
  const kind = kindRaw as StockistKind;
  if (!name) return { ok: false, error: `Enter a ${KIND_NOUN[kind]} name.` };

  if (kind === "sub_dealer") {
    if (!parentId) return { ok: false, error: "Pick the dealer this sub-dealer sits under." };
    const [parent] = await db
      .select({ kind: stockists.kind, cnfId: stockists.cnfId })
      .from(stockists)
      .where(eq(stockists.id, parentId))
      .limit(1);
    if (!parent) return { ok: false, error: "That dealer no longer exists." };
    if (parent.kind !== "dealer") return { ok: false, error: "A sub-dealer can only sit under a dealer." };
    if (parent.cnfId !== cnfId) return { ok: false, error: "That dealer belongs to a different C&F." };
  } else if (parentId) {
    return { ok: false, error: `A ${KIND_NOUN[kind]} has no parent.` };
  }

  // `onConflictDoNothing().returning()` gives back an empty array when the name
  // was already taken — previously that silently no-opped, so the user clicked
  // Add and nothing happened with no explanation.
  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(stockists)
      .values({ name, cnfId, kind, parentId: kind === "sub_dealer" ? parentId : null })
      .onConflictDoNothing()
      .returning({ id: stockists.id });
  } catch (e) {
    return insertFailure(e, KIND_NOUN[kind]);
  }
  if (inserted.length === 0) {
    return { ok: false, error: `A stockist named "${name}" already exists.` };
  }

  revalidatePath("/hq/depots");
  return { ok: true };
}

export async function addArea(cnfId: string, formData: FormData): Promise<WriteResult> {
  await requireHqScope(cnfId);
  const name = String(formData.get("name") ?? "").trim();
  const stockistId = String(formData.get("depotId") ?? "");
  if (!name) return { ok: false, error: "Enter an area name." };
  if (!stockistId) return { ok: false, error: "Pick a stockist." };

  // Ensure the depot belongs to this C&F before adding an area under it.
  const [depot] = await db.select().from(stockists).where(eq(stockists.id, stockistId)).limit(1);
  if (!depot || depot.cnfId !== cnfId) {
    return { ok: false, error: "That depot isn't in this C&F." };
  }

  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(areas)
      .values({ name, stockistId })
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
  const [depot] = await db.select().from(stockists).where(eq(stockists.id, area.stockistId)).limit(1);
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

export async function deleteDepot(stockistId: string): Promise<WriteResult> {
  const [depot] = await db.select().from(stockists).where(eq(stockists.id, stockistId)).limit(1);
  if (!depot) return { ok: false, error: "Depot not found." };
  await requireHqScope(depot.cnfId);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(counters).where(eq(counters.stockistId, stockistId));
      await tx.delete(areas).where(eq(areas.stockistId, stockistId));
      await tx.delete(stockists).where(eq(stockists.id, stockistId));
    });
  } catch (e) {
    return deleteFailure(e, "depot");
  }
  revalidatePath("/hq/depots");
  return { ok: true };
}
