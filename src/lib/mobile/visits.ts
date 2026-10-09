import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  stockists,
  users,
  visits,
  type CompetitorPresence,
  type ProductSegment,
} from "@/db/schema";
import type { getCurrentUser } from "@/lib/auth/dal";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { hasStartedToday } from "@/lib/field/day-log";
import {
  COMPETITOR_OPTIONS,
  competitorDisplayLabel,
  editableVisitCutoff,
  editWindowRemaining,
  formatDuration,
  isWithinEditWindow,
  PRODUCT_SEGMENTS,
} from "@/lib/field/products";
import type { VisitInput } from "@/lib/field/visit-actions";
import { findTodaysVisit } from "@/lib/field/visit-day";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id would make Postgres throw; treat it as "not found". */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The options the visit form offers, from the server so the app hard-codes none. */
export const VISIT_FORM_OPTIONS = {
  products: PRODUCT_SEGMENTS,
  competitors: COMPETITOR_OPTIONS,
  /** Ranks 1–5; null is "N/A" (not ranked). */
  ranks: [1, 2, 3, 4, 5, null] as (number | null)[],
};

/**
 * The counter page for the app: details, what the ISR can do today, and the
 * still-editable visit history.
 *
 * Mirrors the website's `/field/counter/[id]` page (which reads inline) with
 * the same scoping and the same once-a-day rule. Keep the two in step.
 */
export async function getMobileCounter(user: CurrentUser, id: string) {
  const isAdmin = user.accessRoles.includes("admin");

  const historyWhere = isAdmin
    ? and(eq(visits.counterId, id), gte(visits.visitedAt, editableVisitCutoff()))
    : and(eq(visits.counterId, id), eq(visits.userId, user.id), gte(visits.visitedAt, editableVisitCutoff()));

  const [[counter], history, todaysVisit, startedToday] = await Promise.all([
    db
      .select({
        id: counters.id,
        name: counters.name,
        phone: counters.phone,
        type: counters.type,
        typeOther: counters.typeOther,
        areaName: areas.name,
        cnfName: cnfs.name,
        stockistId: counters.stockistId,
        stockistName: stockists.name,
        lat: counters.lat,
        lng: counters.lng,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .innerJoin(stockists, eq(stockists.id, counters.stockistId))
      .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
      .where(eq(counters.id, id))
      .limit(1),
    db
      .select({
        id: visits.id,
        userId: visits.userId,
        repName: users.name,
        visitedAt: visits.visitedAt,
        items: visits.items,
        rank: visits.rank,
        competitor: visits.competitor,
        competitorBrand: visits.competitorBrand,
        remarks: visits.remarks,
        durationSeconds: visits.durationSeconds,
      })
      .from(visits)
      .innerJoin(users, eq(users.id, visits.userId))
      .where(historyWhere)
      .orderBy(desc(visits.visitedAt)),
    // A colleague's visit today blocks this ISR too, so this is not read from
    // `history` (which only holds the ISR's own). Admin is exempt.
    isAdmin ? Promise.resolve(null) : findTodaysVisit(user.id, id),
    isAdmin ? Promise.resolve(true) : hasStartedToday(user.id),
  ]);
  if (!counter) return null;

  const canVisit = isAdmin || counter.stockistId === user.depot?.id;
  const editable = (h: (typeof history)[number]) =>
    (h.userId === user.id || isAdmin) && isWithinEditWindow(h.visitedAt);
  const hasEditable = history.some(editable);

  /** What the big button on the counter page does today. */
  const action = !canVisit
    ? { kind: "not_your_stockist" as const, stockistName: counter.stockistName }
    : todaysVisit && !todaysVisit.isOwn
      ? {
          kind: "visited_by_other" as const,
          byName: todaysVisit.userName,
          atLabel: formatISTTime(todaysVisit.visitedAt),
        }
      : todaysVisit
        ? { kind: "edit_today" as const, visitId: todaysVisit.id }
        : !startedToday
          ? { kind: "start_day_first" as const }
          : { kind: "add_visit" as const };

  return {
    counter: {
      id: counter.id,
      name: counter.name,
      phone: counter.phone,
      typeLabel: counterTypeLabel(counter.type, counter.typeOther),
      areaName: counter.areaName,
      cnfName: counter.cnfName,
      stockistName: counter.stockistName,
      gps: counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : null,
    },
    action,
    editWindowLeft: hasEditable ? editWindowRemaining() : null,
    history: history.map((h) => ({
      id: h.id,
      dateLabel: formatISTDate(h.visitedAt),
      timeLabel: formatISTTime(h.visitedAt),
      repName: h.repName,
      durationLabel: h.durationSeconds != null ? formatDuration(h.durationSeconds) : null,
      items: h.items,
      rankLabel: h.rank != null ? `#${h.rank}` : "—",
      competitorLabel: h.competitor ? competitorDisplayLabel(h.competitor, h.competitorBrand) : "—",
      remarks: h.remarks,
      editable: editable(h),
    })),
  };
}

/** Name and "type · area" line for the visit form header. */
export async function getCounterHeader(id: string) {
  const [c] = await db
    .select({ id: counters.id, name: counters.name, type: counters.type, typeOther: counters.typeOther, areaName: areas.name })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, id))
    .limit(1);
  return c ? { id: c.id, name: c.name, subtitle: `${counterTypeLabel(c.type, c.typeOther)} · ${c.areaName}` } : null;
}

/**
 * A visit from a request body, coerced to the shape the visit actions expect.
 * Numbers are made whole numbers here; every rule (at least one product, rank
 * 1–5, competitor brand required…) is left to `createVisit` / `updateVisit`.
 */
export function visitInputFromBody(body: unknown): VisitInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const segments = new Set<string>(PRODUCT_SEGMENTS.map((p) => p.value));
  const rawItems = Array.isArray(b.items) ? b.items : [];

  const items = rawItems.flatMap((raw) => {
    const it = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (typeof it.segment !== "string" || !segments.has(it.segment)) return [];
    return [{ segment: it.segment as ProductSegment, stock: wholeNumber(it.stock), sold: wholeNumber(it.sold) }];
  });

  return {
    items,
    rank: typeof b.rank === "number" && Number.isFinite(b.rank) ? Math.floor(b.rank) : null,
    competitor: typeof b.competitor === "string" ? (b.competitor as CompetitorPresence) : null,
    competitorBrand: typeof b.competitorBrand === "string" ? b.competitorBrand : "",
    remarks: typeof b.remarks === "string" ? b.remarks : "",
    durationSeconds: typeof b.durationSeconds === "number" ? b.durationSeconds : null,
  };
}

/** Negative stays negative so `validate` reports it rather than it being hidden. */
function wholeNumber(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}
