"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { depotStock, productSegmentEnum, stockMovements, type ProductSegment } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

type Result = { ok: true } | { ok: false; error: string };

export type RecordMovementInput = {
  depotId: string;
  segment: ProductSegment;
  direction: "inward" | "outward";
  qty: number;
};

/** Log an inward/outward stock movement and adjust the depot's on-hand for
 * that SKU. Dealers may only touch their own depot; admin any depot. */
export async function recordMovement(input: RecordMovementInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.accessRoles.includes("dealer")) {
    return { ok: false, error: "Not authorized." };
  }
  if (!isAdmin && user.depot?.id !== input.depotId) {
    return { ok: false, error: "You can only manage your own depot's stock." };
  }
  if (!productSegmentEnum.enumValues.includes(input.segment)) {
    return { ok: false, error: "Pick a valid SKU." };
  }
  if (input.direction !== "inward" && input.direction !== "outward") {
    return { ok: false, error: "Invalid movement." };
  }
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Enter a quantity greater than zero." };
  }

  await db.insert(stockMovements).values({
    depotId: input.depotId,
    segment: input.segment,
    direction: input.direction,
    qty,
    createdByUserId: user.id,
  });

  const delta = input.direction === "inward" ? qty : -qty;
  const [existing] = await db
    .select()
    .from(depotStock)
    .where(and(eq(depotStock.depotId, input.depotId), eq(depotStock.segment, input.segment)))
    .limit(1);
  if (existing) {
    await db
      .update(depotStock)
      .set({ onHand: Math.max(0, existing.onHand + delta), updatedAt: new Date() })
      .where(eq(depotStock.id, existing.id));
  } else {
    await db
      .insert(depotStock)
      .values({ depotId: input.depotId, segment: input.segment, onHand: Math.max(0, delta) });
  }

  revalidatePath("/depot/stock");
  revalidatePath("/depot/counters");
  return { ok: true };
}
