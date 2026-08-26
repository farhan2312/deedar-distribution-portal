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
import { istDateString } from "@/lib/date";
import { hasStartedToday, START_DAY_REQUIRED } from "./day-log";
import { ALREADY_VISITED_TODAY, findTodaysVisit, visitedByOther } from "./visit-day";
import { isWithinEditWindow } from "./products";

const SEGMENTS: ProductSegment[] = ["DG10", "DG20", "DB20", "DB40"];
const COMPETITORS: CompetitorPresence[] = ["none", "local", "national"];

export type VisitInput = {
  items: VisitItem[];
  rank: number | null;
  competitor: CompetitorPresence | null;
  /** Free-text brand name, required when `competitor` is "local" or
   * "national" — which competitor, not just that one exists. */
  competitorBrand?: string;
  remarks: string;
  /** Seconds spent on the counter — sampled from the client timer at submit.
   * Only meaningful on create; ignored on edit (kept from the original). */
  durationSeconds?: number | null;
};

type Result =
  | { ok: true; visitId: string }
  | {
      ok: false;
      /** English sentence — what a non-UI caller reads, and the dictionary key
       * the form translates when no `blockedByName` is present. */
      error: string;
      existingVisitId?: string;
      /** Set when another rep owns today's visit, so the form can render the
       * translated template with the name in it. */
      blockedByName?: string;
    };

function validate(input: VisitInput): string | null {
  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  if (items.length === 0) return "Add at least one product with a segment.";
  for (const i of items) {
    if (i.stock < 0 || i.sold < 0) return "Stock and sold cannot be negative.";
  }
  // Rank is optional (the form offers "N/A" → null); if given it's 1–5.
  if (input.rank != null && (input.rank < 1 || input.rank > 5)) {
    return "Deedar rank must be between 1 and 5.";
  }
  if (!input.competitor || !COMPETITORS.includes(input.competitor)) {
    return "Select competitor presence.";
  }
  if (input.competitor !== "none" && !input.competitorBrand?.trim()) {
    return "Name the competitor brand.";
  }
  return null;
}

/** A Postgres unique-violation on a named constraint. Narrow on purpose:
 * anything else must keep propagating rather than being swallowed as a
 * duplicate. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
  return (
    e.code === "23505" && (e.constraint_name === constraint || e.constraint === constraint)
  );
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
  // Admin isn't on a beat and keeps no day log, so the clock-in gate is for
  // reps only.
  if (!isAdmin && !(await hasStartedToday(user.id))) {
    return { ok: false, error: START_DAY_REQUIRED };
  }

  // One visit per counter per day, whoever the rep is. Admin is exempt for the
  // same reason it is exempt from the clock-in gate: it works outside the beat,
  // and is the account that fixes data rather than collects it.
  if (!isAdmin) {
    const existing = await findTodaysVisit(user.id, counter.id);
    if (existing) {
      // Only the owner gets a link to edit — sending someone else there would
      // let them overwrite a colleague's numbers.
      return existing.isOwn
        ? { ok: false, error: ALREADY_VISITED_TODAY, existingVisitId: existing.id }
        : { ok: false, error: visitedByOther(existing.userName), blockedByName: existing.userName };
    }
  }

  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalStock = items.reduce((s, i) => s + i.stock, 0);
  // Cleared whenever competitor is "none" — a brand name left over from a
  // previous selection shouldn't survive switching back to no-competitor.
  const competitorBrand = input.competitor !== "none" ? input.competitorBrand?.trim() || null : null;
  const now = new Date();

  let v: { id: string };
  try {
    [v] = await db
      .insert(visits)
      .values({
        userId: user.id,
        counterId: counter.id,
        visitedAt: now,
        // The IST day the partial unique index keys on. Set for every row this
        // action writes; historical rows keep NULL and stay out of the index.
        visitDate: istDateString(now),
        stock: totalStock,
        sold: totalSold,
        items,
        rank: input.rank,
        competitor: input.competitor,
        competitorBrand,
        remarks: input.remarks.trim() || null,
        durationSeconds: normalizeDuration(input.durationSeconds),
        updatedAt: now,
      })
      .returning({ id: visits.id });
  } catch (err) {
    // 23505 on this index means another rep's visit landed between the check
    // above and this insert — a real race, not a bug. Re-read so the message
    // can name them, and report it exactly as the pre-check would have.
    if (isUniqueViolation(err, "visits_counter_day_unique")) {
      const existing = await findTodaysVisit(user.id, counter.id);
      if (existing?.isOwn) {
        return { ok: false, error: ALREADY_VISITED_TODAY, existingVisitId: existing.id };
      }
      return existing
        ? { ok: false, error: visitedByOther(existing.userName), blockedByName: existing.userName }
        : { ok: false, error: ALREADY_VISITED_TODAY };
    }
    throw err;
  }

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
  // Reps may only edit their own; admin can correct anyone's, so a same-day
  // mistake can be fixed centrally. The midnight lock applies to BOTH — once
  // the day closes its figures are final for everyone.
  if (v.userId !== user.id && !user.accessRoles.includes("admin")) {
    return { ok: false, error: "You can only edit your own visits." };
  }
  if (!isWithinEditWindow(v.visitedAt)) {
    return { ok: false, error: "This visit locked at midnight and can no longer be edited." };
  }

  const items = input.items.filter((i) => SEGMENTS.includes(i.segment));
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalStock = items.reduce((s, i) => s + i.stock, 0);
  const competitorBrand = input.competitor !== "none" ? input.competitorBrand?.trim() || null : null;

  await db
    .update(visits)
    .set({
      stock: totalStock,
      sold: totalSold,
      items,
      rank: input.rank,
      competitor: input.competitor,
      competitorBrand,
      remarks: input.remarks.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(visits.id, visitId));

  revalidatePath(`/field/counter/${v.counterId}`);
  return { ok: true, visitId };
}

/** Load a visit for the edit form. Owner (or admin) + within window only —
 * mirrors the check in `updateVisit` so the form can't open on something the
 * action would then refuse to save. */
export async function getVisitForEdit(visitId: string) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return null;

  const isAdmin = user.accessRoles.includes("admin");
  const [v] = await db
    .select()
    .from(visits)
    .where(
      isAdmin
        ? eq(visits.id, visitId)
        : and(eq(visits.id, visitId), eq(visits.userId, user.id)),
    )
    .limit(1);
  if (!v || !isWithinEditWindow(v.visitedAt)) return null;

  return {
    counterId: v.counterId,
    rank: v.rank,
    competitor: v.competitor,
    competitorBrand: v.competitorBrand ?? "",
    remarks: v.remarks ?? "",
    items: v.items,
  };
}
