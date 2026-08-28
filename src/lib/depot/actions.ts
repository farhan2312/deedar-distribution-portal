"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  counters,
  stockistStock,
  stockistStockDays,
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
  stockistId: string;
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

async function guard(stockistId: string): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  // Dealers and sub-dealers manage their own stock through this same portal.
  if (!isAdmin && !user.accessRoles.includes("depot") && !user.accessRoles.includes("dealer")) {
    return { error: "Not authorized." };
  }
  if (!isAdmin && user.depot?.id !== stockistId) {
    return { error: "You can only manage your own depot's stock." };
  }
  return { user };
}

/** Rewrite today's closing balance from the live on-hand figures. */
async function stampClosingBalance(stockistId: string) {
  const rows = await db
    .select({ segment: stockistStock.segment, onHand: stockistStock.onHand })
    .from(stockistStock)
    .where(eq(stockistStock.stockistId, stockistId));

  const closing: Partial<Record<ProductSegment, number>> = {};
  let total = 0;
  for (const r of rows) {
    closing[r.segment] = r.onHand;
    total += r.onHand;
  }

  const stockDate = istDateString();
  await db
    .insert(stockistStockDays)
    .values({ stockistId, stockDate, closing, total })
    .onConflictDoUpdate({
      target: [stockistStockDays.stockistId, stockistStockDays.stockDate],
      set: { closing, total, updatedAt: new Date() },
    });
}

/**
 * Log a stock movement and adjust the depot's on-hand for that SKU. Refuses
 * once the day has been closed — that's the point of closing it.
 */
export async function recordMovement(input: RecordMovementInput): Promise<Result> {
  const g = await guard(input.stockistId);
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
    .select({ closed: stockistStockDays.closed })
    .from(stockistStockDays)
    .where(and(eq(stockistStockDays.stockistId, input.stockistId), eq(stockistStockDays.stockDate, stockDate)))
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
      .select({ id: users.id, stockistId: users.stockistId, accessRoles: users.accessRoles })
      .from(users)
      .where(eq(users.id, input.repUserId))
      .limit(1);
    if (!rep || rep.stockistId !== input.stockistId || !rep.accessRoles.includes("field")) {
      return { ok: false, error: "That salesman isn't a field rep in this depot." };
    }
    repUserId = rep.id;
  }

  if (input.type === "outward_wholesale") {
    if (!input.wholesaleCounterId) {
      return { ok: false, error: "Select which Wholesale counter this stock was moved to." };
    }
    const [counter] = await db
      .select({ id: counters.id, stockistId: counters.stockistId, type: counters.type })
      .from(counters)
      .where(eq(counters.id, input.wholesaleCounterId))
      .limit(1);
    if (!counter || counter.stockistId !== input.stockistId || counter.type !== "Wholesale") {
      return { ok: false, error: "That isn't a wholesale counter in this depot." };
    }
    wholesaleCounterId = counter.id;
  }

  await db.insert(stockMovements).values({
    stockistId: input.stockistId,
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
    .from(stockistStock)
    .where(and(eq(stockistStock.stockistId, input.stockistId), eq(stockistStock.segment, input.segment)))
    .limit(1);
  if (existing) {
    await db
      .update(stockistStock)
      .set({ onHand: Math.max(0, existing.onHand + qty), updatedAt: new Date() })
      .where(eq(stockistStock.id, existing.id));
  } else {
    await db
      .insert(stockistStock)
      .values({ stockistId: input.stockistId, segment: input.segment, onHand: Math.max(0, qty) });
  }

  // History is logged automatically at each movement, per the prototype.
  await stampClosingBalance(input.stockistId);

  revalidatePath("/depot/stock");
  revalidatePath("/depot/counters");
  return { ok: true };
}

/** Freeze today's closing balance — locks further movements for the day. */
export async function closeStockDay(stockistId: string): Promise<Result> {
  const g = await guard(stockistId);
  if ("error" in g) return { ok: false, error: g.error };
  const { user } = g;

  await stampClosingBalance(stockistId);

  const stockDate = istDateString();
  await db
    .update(stockistStockDays)
    .set({ closed: true, closedByUserId: user.id, closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stockistStockDays.stockistId, stockistId), eq(stockistStockDays.stockDate, stockDate)));

  revalidatePath("/depot/stock");
  return { ok: true };
}
