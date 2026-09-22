"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  counters,
  users,
  visits,
  type CompetitorPresence,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { recordAudit, diffFields } from "@/lib/audit/record";
import { deleteFailure, type WriteResult } from "@/lib/db-errors";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, istDateString } from "@/lib/date";
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
    // The name is read here so the audit row can say which shop was visited
    // without a second query, and keeps reading right if the counter is later
    // renamed or deleted.
    .select({ id: counters.id, stockistId: counters.stockistId, name: counters.name })
    .from(counters)
    .where(eq(counters.id, counterId))
    .limit(1);
  if (!counter) return { ok: false, error: "Counter not found." };

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && counter.stockistId !== user.depot?.id) {
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

  await recordAudit({
    action: "create",
    module: "visits",
    entityId: v.id,
    entityLabel: counter.name,
    summary: `Visited ${counter.name} — sold ${totalSold}, stock ${totalStock}`,
  });

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
    .select({
      id: visits.id,
      userId: visits.userId,
      counterId: visits.counterId,
      visitedAt: visits.visitedAt,
      counterName: counters.name,
      // Pre-edit figures, for the change list on the audit row.
      sold: visits.sold,
      stock: visits.stock,
      rank: visits.rank,
      competitor: visits.competitor,
      competitorBrand: visits.competitorBrand,
      remarks: visits.remarks,
    })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!v) return { ok: false, error: "Visit not found." };
  const isAdmin = user.accessRoles.includes("admin");
  // Reps may only edit their own; admin can correct anyone's, so a mistake can
  // be fixed centrally.
  if (v.userId !== user.id && !isAdmin) {
    return { ok: false, error: "You can only edit your own visits." };
  }
  /**
   * The midnight lock is a rep's lock. Their figures going final when the day
   * closes is what stops yesterday's numbers moving under a supervisor who has
   * already read them.
   *
   * Admin is the exception, and the only one: correcting a visit logged wrong —
   * or one of a run of duplicates from a retried submit weeks back — is the job
   * that account exists for. The edit is not silent; the audit row below says
   * so explicitly when it lands after the window closed.
   */
  const afterWindow = !isWithinEditWindow(v.visitedAt);
  if (afterWindow && !isAdmin) {
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

  await recordAudit({
    action: "update",
    module: "visits",
    entityId: visitId,
    entityLabel: v.counterName,
    summary: afterWindow
      ? `Corrected ${formatISTDate(v.visitedAt)}'s visit to ${v.counterName} after it locked`
      : `Edited the visit to ${v.counterName}`,
    changes: diffFields(
      {
        sold: v.sold,
        stock: v.stock,
        rank: v.rank,
        competitor: v.competitor,
        competitorBrand: v.competitorBrand,
        remarks: v.remarks,
      },
      {
        sold: totalSold,
        stock: totalStock,
        rank: input.rank,
        competitor: input.competitor,
        competitorBrand,
        remarks: input.remarks.trim() || null,
      },
      {
        sold: "Sold",
        stock: "Stock",
        rank: "Rank",
        competitor: "Competitor",
        competitorBrand: "Competitor brand",
        remarks: "Remarks",
      },
    ),
  });

  revalidateVisit(v.counterId);
  return { ok: true, visitId };
}

/**
 * Remove one visit. Admin only, and permanent.
 *
 * There is no soft delete, so the audit line is all that survives — which is
 * why the summary carries the figures the row was holding rather than just its
 * id. It is the only record left of what was taken out of the totals.
 */
export async function deleteVisit(visitId: string): Promise<WriteResult> {
  const user = await getCurrentUser();
  // Not `canAccess`: a field rep with the "field" role must not be able to
  // erase history, their own included. This is a Central Admin correction tool.
  if (!user || !user.accessRoles.includes("admin")) {
    return { ok: false, error: "Only Central Admin can delete a visit." };
  }

  const [v] = await db
    .select({
      counterId: visits.counterId,
      visitedAt: visits.visitedAt,
      sold: visits.sold,
      stock: visits.stock,
      counterName: counters.name,
      repName: users.name,
    })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(users, eq(users.id, visits.userId))
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!v) return { ok: false, error: "Visit not found." };

  try {
    await db.delete(visits).where(eq(visits.id, visitId));
  } catch (err) {
    return deleteFailure(err, "visit");
  }

  // `counters.lastVisitAt` is a cached copy of the newest visit, so removing
  // one can leave the counter advertising a visit that no longer exists. Rebuilt
  // from what remains — null when that was the only one, which is what "Never
  // visited" reads from.
  const [newest] = await db
    .select({ at: visits.visitedAt })
    .from(visits)
    .where(eq(visits.counterId, v.counterId))
    .orderBy(desc(visits.visitedAt))
    .limit(1);
  await db
    .update(counters)
    .set({ lastVisitAt: newest?.at ?? null })
    .where(eq(counters.id, v.counterId));

  await recordAudit({
    action: "delete",
    module: "visits",
    entityId: visitId,
    entityLabel: v.counterName,
    summary: `Deleted ${v.repName}'s ${formatISTDate(v.visitedAt)} visit to ${v.counterName} — sold ${v.sold}, stock ${v.stock}`,
  });

  revalidateVisit(v.counterId);
  return { ok: true };
}

/** Every screen a visit's figures show up on. The Kanpur HQ pages are in the
 * list because that is where a visit is now edited from, and Reports reads the
 * same totals. */
function revalidateVisit(counterId: string): void {
  revalidatePath(`/field/counter/${counterId}`);
  revalidatePath(`/khq/counter/${counterId}`);
  revalidatePath("/khq/reports");
}

/** Load a visit for the edit form. Owner (or admin) only, and — for a rep —
 * within the day window: mirrors the checks in `updateVisit` so the form can't
 * open on something the action would then refuse to save. */
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
  if (!v || (!isAdmin && !isWithinEditWindow(v.visitedAt))) return null;

  return {
    counterId: v.counterId,
    rank: v.rank,
    competitor: v.competitor,
    competitorBrand: v.competitorBrand ?? "",
    remarks: v.remarks ?? "",
    items: v.items,
  };
}
