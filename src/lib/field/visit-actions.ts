"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  counters,
  visits,
  type CompetitorPresence,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { isWithinEditWindow, MAX_VISIT_SOLD } from "./products";

const SEGMENTS: ProductSegment[] = ["DG10", "DG20", "DB20", "DB40"];
const COMPETITORS: CompetitorPresence[] = ["none", "local", "national"];

export type VisitInput = {
  items: VisitItem[];
  rank: number | null;
  competitor: CompetitorPresence | null;
  remarks: string;
  /** Seconds spent on the counter — sampled from the client timer at submit.
   * Only meaningful on create; ignored on edit (kept from the original). */
  durationSeconds?: number | null;
};

type Result = { ok: true; visitId: string } | { ok: false; error: string };

function validate(input: VisitInput): string | null {
  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  if (items.length === 0) return "Add at least one product with a segment.";
  for (const i of items) {
    if (i.stock < 0 || i.sold < 0) return "Stock and sold cannot be negative.";
  }
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  if (totalSold > MAX_VISIT_SOLD) {
    return `Total packets sold across all SKUs can't exceed ${MAX_VISIT_SOLD}.`;
  }
  // Rank is optional (the form offers "N/A"); if given it must be ≥ 1.
  if (input.rank != null && input.rank < 1) return "Deedar rank must be at least 1.";
  if (!input.competitor || !COMPETITORS.includes(input.competitor)) {
    return "Select competitor presence.";
  }
  return null;
}

function normalizeDuration(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v) || v < 0) return null;
  // Cap at 24h — anything longer is almost certainly a client-side clock bug,
  // not a real visit. Coerce to an integer number of seconds.
  return Math.min(24 * 60 * 60, Math.floor(v));
}

export async function createVisit(counterId: string, input: VisitInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return { ok: false, error: "Not authorized." };

  const err = validate(input);
  if (err) return { ok: false, error: err };

  const [counter] = await db
    .select({ id: counters.id, depotId: counters.depotId })
    .from(counters)
    .where(eq(counters.id, counterId))
    .limit(1);
  if (!counter) return { ok: false, error: "Counter not found." };

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && counter.depotId !== user.depot?.id) {
    return { ok: false, error: "You can only add visits to counters in your own depot." };
  }

  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalStock = items.reduce((s, i) => s + i.stock, 0);
  const now = new Date();

  const [v] = await db
    .insert(visits)
    .values({
      userId: user.id,
      counterId: counter.id,
      visitedAt: now,
      stock: totalStock,
      sold: totalSold,
      items,
      rank: input.rank,
      competitor: input.competitor,
      remarks: input.remarks.trim() || null,
      durationSeconds: normalizeDuration(input.durationSeconds),
      updatedAt: now,
    })
    .returning({ id: visits.id });

  await db.update(counters).set({ lastVisitAt: now }).where(eq(counters.id, counter.id));

  revalidatePath("/field/beat");
  revalidatePath(`/field/counter/${counterId}`);
  return { ok: true, visitId: v.id };
}

export async function updateVisit(visitId: string, input: VisitInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return { ok: false, error: "Not authorized." };

  const err = validate(input);
  if (err) return { ok: false, error: err };

  const [v] = await db
    .select({ id: visits.id, userId: visits.userId, counterId: visits.counterId, visitedAt: visits.visitedAt })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!v) return { ok: false, error: "Visit not found." };
  if (v.userId !== user.id) return { ok: false, error: "You can only edit your own visits." };
  if (!isWithinEditWindow(v.visitedAt)) {
    return { ok: false, error: "This visit is older than 24 hours and can no longer be edited." };
  }

  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalStock = items.reduce((s, i) => s + i.stock, 0);

  await db
    .update(visits)
    .set({
      stock: totalStock,
      sold: totalSold,
      items,
      rank: input.rank,
      competitor: input.competitor,
      remarks: input.remarks.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(visits.id, visitId));

  revalidatePath(`/field/counter/${v.counterId}`);
  return { ok: true, visitId };
}

/** Load a visit for the edit form (owner + within window only). */
export async function getVisitForEdit(visitId: string) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return null;

  const [v] = await db
    .select()
    .from(visits)
    .where(and(eq(visits.id, visitId), eq(visits.userId, user.id)))
    .limit(1);
  if (!v || !isWithinEditWindow(v.visitedAt)) return null;

  return {
    counterId: v.counterId,
    rank: v.rank,
    competitor: v.competitor,
    remarks: v.remarks ?? "",
    items: v.items,
  };
}
