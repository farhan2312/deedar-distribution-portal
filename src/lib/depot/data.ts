import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import type { AccessRole, ProductSegment, StockMovementType } from "@/db/schema";
import {
  areas,
  counters,
  stockists,
  stockistStock,
  stockistStockDays,
  schemeClaims,
  stockMovements,
  users,
  visits,
} from "@/db/schema";
import { formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";

export type ScopeUser = {
  accessRoles: AccessRole[];
  depot: { id: string; name: string } | null;
};

export type StockistOption = { id: string; name: string };

/** Depots in scope for the Depot portal: a dealer sees their one depot; admin
 * sees every depot. */
export async function stockistScope(user: ScopeUser): Promise<StockistOption[]> {
  if (user.accessRoles.includes("admin")) {
    return db.select({ id: stockists.id, name: stockists.name }).from(stockists).orderBy(asc(stockists.name));
  }
  return user.depot ? [{ id: user.depot.id, name: user.depot.name }] : [];
}

/** Resolve the depot being viewed from ?depot= against the in-scope list;
 * falls back to the first in-scope depot. */
export function pickStockist(scope: StockistOption[], requested: string | undefined): StockistOption | null {
  if (requested) {
    const match = scope.find((d) => d.id === requested);
    if (match) return match;
  }
  return scope[0] ?? null;
}

// ── Counters page ───────────────────────────────────────────────────────

export type DepotCounterRow = {
  id: string;
  name: string;
  type: string;
  area: string;
  stock: number;
  lastVisitLabel: string;
  status: "active" | "dormant" | "declining";
};

export type DepotCountersData = {
  bulkSales: number;
  /** Wholesale counters only — retail outlets belong to the field reps and are
   * intentionally hidden from the Depot portal (they aren't the depot's list
   * to manage). */
  counters: DepotCounterRow[];
};

export async function getDepotCountersData(stockistId: string): Promise<DepotCountersData> {
  const bounds = istDayBounds();
  const [counterRows, visitRows, outwardToday] = await Promise.all([
    // Scoped to Wholesale at the SQL layer so retail rows never even leave
    // the DB — the client can't reveal them via devtools either.
    db
      .select({
        id: counters.id,
        name: counters.name,
        type: counters.type,
        typeOther: counters.typeOther,
        area: areas.name,
        status: counters.status,
        lastVisitAt: counters.lastVisitAt,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(and(eq(counters.stockistId, stockistId), eq(counters.type, "Wholesale")))
      .orderBy(asc(counters.name)),
    // Only used to hydrate the per-counter "last observed stock" on the
    // wholesale rows — scoped to wholesale counters so we don't pull retail
    // visits we'd then throw away.
    db
      .select({ counterId: visits.counterId, stock: visits.stock })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(and(eq(counters.stockistId, stockistId), eq(counters.type, "Wholesale")))
      .orderBy(desc(visits.visitedAt)),
    // "Bulk sales" = bora lifting by wholesale counters. This is what the
    // depot actually cares about — retail sales are the reps' number, not
    // the depot's, so no "salesman market sales" tile here.
    db
      .select({ qty: stockMovements.qty })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.stockistId, stockistId),
          eq(stockMovements.type, "outward_wholesale"),
          gte(stockMovements.createdAt, bounds.start),
          lt(stockMovements.createdAt, bounds.end),
        ),
      ),
  ]);

  // Rows are newest-first, so the first hit per counter wins.
  const latestStock = new Map<string, number>();
  for (const v of visitRows) {
    if (!latestStock.has(v.counterId)) latestStock.set(v.counterId, v.stock);
  }
  // qty is signed (outward is negative) — report it as a positive packet count.
  const bulkSales = outwardToday.reduce((s, m) => s + Math.abs(m.qty), 0);

  const rows: DepotCounterRow[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: counterTypeLabel(c.type, c.typeOther),
    area: c.area,
    stock: latestStock.get(c.id) ?? 0,
    lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : "—",
    status: c.status,
  }));

  return { bulkSales, counters: rows };
}

// ── Schemes page ────────────────────────────────────────────────────────

export type SchemeClaimRow = {
  id: string;
  retailer: string;
  code: string;
  value: number;
  status: "paid" | "processing" | "rejected";
  whenLabel: string;
};

export type DepotSchemesData = { payoutToday: number; claims: SchemeClaimRow[] };

export async function getDepotSchemesData(stockistId: string): Promise<DepotSchemesData> {
  const bounds = istDayBounds();
  const rows = await db
    .select({
      id: schemeClaims.id,
      retailer: counters.name,
      code: schemeClaims.code,
      value: schemeClaims.value,
      status: schemeClaims.status,
      createdAt: schemeClaims.createdAt,
    })
    .from(schemeClaims)
    .innerJoin(counters, eq(counters.id, schemeClaims.counterId))
    .where(eq(schemeClaims.stockistId, stockistId))
    .orderBy(desc(schemeClaims.createdAt));

  const payoutToday = rows
    .filter((r) => r.status === "paid" && r.createdAt >= bounds.start && r.createdAt < bounds.end)
    .reduce((s, r) => s + r.value, 0);

  return {
    payoutToday,
    claims: rows.map((r) => ({
      id: r.id,
      retailer: r.retailer,
      code: r.code,
      value: r.value,
      status: r.status,
      whenLabel: formatISTDate(r.createdAt),
    })),
  };
}

// ── Stock page ──────────────────────────────────────────────────────────

const SEGMENT_ORDER: ProductSegment[] = ["DG10", "DG20", "DB20", "DB40"];

export type StockRow = {
  segment: ProductSegment;
  onHand: number;
  lowThreshold: number;
};

export type MovementRow = {
  id: string;
  segment: ProductSegment;
  type: StockMovementType;
  /** Signed: negative means the stock left the depot. */
  qty: number;
  note: string | null;
  /** Who the stock went to — rep name or wholesale counter, if applicable. */
  toLabel: string | null;
  /** Who recorded it. */
  by: string | null;
  whenLabel: string;
};

/** One day's frozen-or-running closing balance, for the history table. */
export type StockDayRow = {
  date: string;
  dateLabel: string;
  closing: Partial<Record<ProductSegment, number>>;
  total: number;
  closed: boolean;
  closedBy: string | null;
  closedAtLabel: string | null;
};

export type DepotStockData = {
  rows: StockRow[];
  total: number;
  lowCount: number;
  movementsToday: number;
  maxOnHand: number;
  /** Today's movement log (the "Daily movement log" table). */
  movements: MovementRow[];
  /** Daily closing balances, newest first. */
  history: StockDayRow[];
  /** True once the day is closed — the UI locks all recording. */
  todayClosed: boolean;
  todayClosedBy: string | null;
  todayClosedAtLabel: string | null;
  /** Field reps assignable on an outward_retail movement. */
  reps: { id: string; name: string }[];
  /** Wholesale counters assignable on an outward_wholesale movement. */
  wholesaleCounters: { id: string; name: string }[];
};

export async function getDepotStockData(stockistId: string): Promise<DepotStockData> {
  const today = istDateString();
  const rep = alias(users, "movement_rep");
  const closer = alias(users, "day_closer");

  const [stockRows, movementRows, dayRows, repRows, wholesaleRows] = await Promise.all([
    db.select().from(stockistStock).where(eq(stockistStock.stockistId, stockistId)),
    // Whole log, newest first — the page shows today plus recent history.
    db
      .select({
        id: stockMovements.id,
        segment: stockMovements.segment,
        type: stockMovements.type,
        qty: stockMovements.qty,
        note: stockMovements.note,
        repName: rep.name,
        counterName: counters.name,
        by: users.name,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(users, eq(users.id, stockMovements.createdByUserId))
      .leftJoin(rep, eq(rep.id, stockMovements.repUserId))
      .leftJoin(counters, eq(counters.id, stockMovements.wholesaleCounterId))
      .where(eq(stockMovements.stockistId, stockistId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(25),
    db
      .select({
        stockDate: stockistStockDays.stockDate,
        closing: stockistStockDays.closing,
        total: stockistStockDays.total,
        closed: stockistStockDays.closed,
        closedAt: stockistStockDays.closedAt,
        closedBy: closer.name,
      })
      .from(stockistStockDays)
      .leftJoin(closer, eq(closer.id, stockistStockDays.closedByUserId))
      .where(eq(stockistStockDays.stockistId, stockistId))
      .orderBy(desc(stockistStockDays.stockDate))
      .limit(14),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(eq(users.stockistId, stockistId), sql`'field' = ANY(${users.accessRoles}::text[])`),
      )
      .orderBy(asc(users.name)),
    db
      .select({ id: counters.id, name: counters.name })
      .from(counters)
      .where(and(eq(counters.stockistId, stockistId), eq(counters.type, "Wholesale")))
      .orderBy(asc(counters.name)),
  ]);

  const bySeg = new Map(stockRows.map((r) => [r.segment, r]));
  const rows: StockRow[] = SEGMENT_ORDER.filter((seg) => bySeg.has(seg)).map((seg) => {
    const r = bySeg.get(seg)!;
    return { segment: seg, onHand: r.onHand, lowThreshold: r.lowThreshold };
  });

  const total = rows.reduce((s, r) => s + r.onHand, 0);
  const lowCount = rows.filter((r) => r.onHand < r.lowThreshold).length;
  const maxOnHand = rows.reduce((m, r) => Math.max(m, r.onHand), 0);

  const todayRow = dayRows.find((d) => d.stockDate === today);

  return {
    rows,
    total,
    lowCount,
    movementsToday: movementRows.filter((m) => istDateString(m.createdAt) === today).length,
    maxOnHand,
    movements: movementRows.map((m) => ({
      id: m.id,
      segment: m.segment,
      type: m.type,
      qty: m.qty,
      note: m.note,
      toLabel: m.repName ? `Salesman: ${m.repName}` : m.counterName,
      by: m.by,
      whenLabel: `${formatISTDate(m.createdAt)} ${formatISTTime(m.createdAt)}`,
    })),
    history: dayRows.map((d) => ({
      date: d.stockDate,
      dateLabel: formatISTDate(d.stockDate),
      closing: d.closing,
      total: d.total,
      closed: d.closed,
      closedBy: d.closedBy,
      closedAtLabel: d.closedAt ? formatISTTime(d.closedAt) : null,
    })),
    todayClosed: todayRow?.closed ?? false,
    todayClosedBy: todayRow?.closedBy ?? null,
    todayClosedAtLabel: todayRow?.closedAt ? formatISTTime(todayRow.closedAt) : null,
    reps: repRows,
    wholesaleCounters: wholesaleRows,
  };
}

