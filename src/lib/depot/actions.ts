"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  counters,
  depotStock,
  depotStockDays,
  productSegmentEnum,
  stockMovements,
  stockMovementTypeEnum,
  users,
  type ProductSegment,
  type StockMovementType,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { istDateString } from "@/lib/date";

type Result = { ok: true } | { ok: false; error: string };

export type RecordMovementInput = {
  depotId: string;
  segment: ProductSegment;
  type: StockMovementType;
  /** Magnitude for every type except `manual`, where the sign is honoured. */
  qty: number;
  note: string;
  /** Required when type is outward_retail. */
  repUserId?: string | null;
  /** Required when type is outward_wholesale. */
  wholesaleCounterId?: string | null;
};

/** Inward adds; retail/wholesale/returns subtract; manual is taken as typed. */
function signedQty(type: StockMovementType, qty: number): number {
  if (type === "manual") return Math.trunc(qty);
  const magnitude = Math.abs(Math.trunc(qty));
  return type === "inward" ? magnitude : -magnitude;
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Explicit union so `"error" in g` narrows cleanly at the call sites. */
type GuardResult = { user: SessionUser } | { error: string };

async function guard(depotId: string): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.accessRoles.includes("dealer")) {
    return { error: "Not authorized." };
  }
  if (!isAdmin && user.depot?.id !== depotId) {
    return { error: "You can only manage your own depot's stock." };
  }
  return { user };
}

/** Rewrite today's closing balance from the live on-hand figures. */
async function stampClosingBalance(depotId: string) {
  const rows = await db
    .select({ segment: depotStock.segment, onHand: depotStock.onHand })
    .from(depotStock)
    .where(eq(depotStock.depotId, depotId));

  const closing: Partial<Record<ProductSegment, number>> = {};
  let total = 0;
  for (const r of rows) {
    closing[r.segment] = r.onHand;
    total += r.onHand;
  }

  const stockDate = istDateString();
  await db
    .insert(depotStockDays)
    .values({ depotId, stockDate, closing, total })
    .onConflictDoUpdate({
      target: [depotStockDays.depotId, depotStockDays.stockDate],
      set: { closing, total, updatedAt: new Date() },
    });
}

/**
 * Log a stock movement and adjust the depot's on-hand for that SKU. Refuses
 * once the day has been closed — that's the point of closing it.
 */
export async function recordMovement(input: RecordMovementInput): Promise<Result> {
  const g = await guard(input.depotId);
  if ("error" in g) return { ok: false, error: g.error };
  const { user } = g;

  if (!productSegmentEnum.enumValues.includes(input.segment)) {
    return { ok: false, error: "Pick a valid SKU." };
  }
  if (!stockMovementTypeEnum.enumValues.includes(input.type)) {
    return { ok: false, error: "Pick a valid movement type." };
  }

  const qty = signedQty(input.type, Number(input.qty));
  if (!Number.isFinite(qty) || qty === 0) {
    return { ok: false, error: "Enter a quantity." };
  }

  const stockDate = istDateString();
  const [day] = await db
    .select({ closed: depotStockDays.closed })
    .from(depotStockDays)
    .where(and(eq(depotStockDays.depotId, input.depotId), eq(depotStockDays.stockDate, stockDate)))
    .limit(1);
  if (day?.closed) {
    return { ok: false, error: "Today's stock is closed — no further adjustments allowed." };
  }

  // Each outward flavour must say where the stock actually went.
  let repUserId: string | null = null;
  let wholesaleCounterId: string | null = null;

  if (input.type === "outward_retail") {
    if (!input.repUserId) {
      return { ok: false, error: "Select which Field Salesman ISR this stock was taken by." };
    }
    const [rep] = await db
      .select({ id: users.id, depotId: users.depotId, accessRoles: users.accessRoles })
      .from(users)
      .where(eq(users.id, input.repUserId))
      .limit(1);
    if (!rep || rep.depotId !== input.depotId || !rep.accessRoles.includes("field")) {
      return { ok: false, error: "That salesman isn't a field rep in this depot." };
    }
    repUserId = rep.id;
  }

  if (input.type === "outward_wholesale") {
    if (!input.wholesaleCounterId) {
      return { ok: false, error: "Select which Wholesale counter this stock was moved to." };
    }
    const [counter] = await db
      .select({ id: counters.id, depotId: counters.depotId, type: counters.type })
      .from(counters)
      .where(eq(counters.id, input.wholesaleCounterId))
      .limit(1);
    if (!counter || counter.depotId !== input.depotId || counter.type !== "Wholesale") {
      return { ok: false, error: "That isn't a wholesale counter in this depot." };
    }
    wholesaleCounterId = counter.id;
  }

  await db.insert(stockMovements).values({
    depotId: input.depotId,
    segment: input.segment,
    type: input.type,
    qty,
    note: input.note.trim() || null,
    repUserId,
    wholesaleCounterId,
    createdByUserId: user.id,
  });

  const [existing] = await db
    .select()
    .from(depotStock)
    .where(and(eq(depotStock.depotId, input.depotId), eq(depotStock.segment, input.segment)))
    .limit(1);
  if (existing) {
    await db
      .update(depotStock)
      .set({ onHand: Math.max(0, existing.onHand + qty), updatedAt: new Date() })
      .where(eq(depotStock.id, existing.id));
  } else {
    await db
      .insert(depotStock)
      .values({ depotId: input.depotId, segment: input.segment, onHand: Math.max(0, qty) });
  }

  // History is logged automatically at each movement, per the prototype.
  await stampClosingBalance(input.depotId);

  revalidatePath("/depot/stock");
  revalidatePath("/depot/counters");
  return { ok: true };
}

/** Freeze today's closing balance — locks further movements for the day. */
export async function closeStockDay(depotId: string): Promise<Result> {
  const g = await guard(depotId);
  if ("error" in g) return { ok: false, error: g.error };
  const { user } = g;

  await stampClosingBalance(depotId);

  const stockDate = istDateString();
  await db
    .update(depotStockDays)
    .set({ closed: true, closedByUserId: user.id, closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(depotStockDays.depotId, depotId), eq(depotStockDays.stockDate, stockDate)));

  revalidatePath("/depot/stock");
  return { ok: true };
}
