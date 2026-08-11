import "server-only";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import type { AccessRole, ProductSegment } from "@/db/schema";
import {
  areas,
  counters,
  depots,
  depotStock,
  schemeClaims,
  stockMovements,
  users,
  visits,
} from "@/db/schema";
import { formatISTDate, istDayBounds } from "@/lib/date";

export type ScopeUser = {
  accessRoles: AccessRole[];
  depot: { id: string; name: string } | null;
};

export type DepotOption = { id: string; name: string };

/** Depots in scope for the Depot portal: a dealer sees their one depot; admin
 * sees every depot. */
export async function depotScope(user: ScopeUser): Promise<DepotOption[]> {
  if (user.accessRoles.includes("admin")) {
    return db.select({ id: depots.id, name: depots.name }).from(depots).orderBy(asc(depots.name));
  }
  return user.depot ? [{ id: user.depot.id, name: user.depot.name }] : [];
}

/** Resolve the depot being viewed from ?depot= against the in-scope list;
 * falls back to the first in-scope depot. */
export function pickDepot(scope: DepotOption[], requested: string | undefined): DepotOption | null {
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
  marketSales: number;
  bulkSales: number;
  counters: DepotCounterRow[];
  wholesale: DepotCounterRow[];
};

export async function getDepotCountersData(depotId: string): Promise<DepotCountersData> {
  const bounds = istDayBounds();
  const [counterRows, visitRows, outwardToday] = await Promise.all([
    db
      .select({
        id: counters.id,
        name: counters.name,
        type: counters.type,
        area: areas.name,
        status: counters.status,
        lastVisitAt: counters.lastVisitAt,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(eq(counters.depotId, depotId))
      .orderBy(asc(counters.name)),
    db
      .select({ counterId: visits.counterId, stock: visits.stock, sold: visits.sold, visitedAt: visits.visitedAt })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .where(eq(counters.depotId, depotId))
      .orderBy(desc(visits.visitedAt)),
    db
      .select({ qty: stockMovements.qty })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.depotId, depotId),
          eq(stockMovements.direction, "outward"),
          gte(stockMovements.createdAt, bounds.start),
          lt(stockMovements.createdAt, bounds.end),
        ),
      ),
  ]);

  const latestStock = new Map<string, number>();
  let marketSales = 0;
  for (const v of visitRows) {
    if (!latestStock.has(v.counterId)) latestStock.set(v.counterId, v.stock); // rows are newest-first
    if (v.visitedAt >= bounds.start && v.visitedAt < bounds.end) marketSales += v.sold;
  }
  const bulkSales = outwardToday.reduce((s, m) => s + m.qty, 0);

  const rows: DepotCounterRow[] = counterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    area: c.area,
    stock: latestStock.get(c.id) ?? 0,
    lastVisitLabel: c.lastVisitAt ? formatISTDate(c.lastVisitAt) : "—",
    status: c.status,
  }));

  return {
    marketSales,
    bulkSales,
    counters: rows.filter((r) => r.type !== "Wholesale"),
    wholesale: rows.filter((r) => r.type === "Wholesale"),
  };
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

export async function getDepotSchemesData(depotId: string): Promise<DepotSchemesData> {
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
    .where(eq(schemeClaims.depotId, depotId))
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
  direction: "inward" | "outward";
  qty: number;
  note: string | null;
  by: string | null;
  whenLabel: string;
};

export type DepotStockData = {
  rows: StockRow[];
  total: number;
  lowCount: number;
  movementsToday: number;
  maxOnHand: number;
  recent: MovementRow[];
};

export async function getDepotStockData(depotId: string): Promise<DepotStockData> {
  const bounds = istDayBounds();
  const [stockRows, todayCount, recentRows] = await Promise.all([
    db.select().from(depotStock).where(eq(depotStock.depotId, depotId)),
    db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.depotId, depotId),
          gte(stockMovements.createdAt, bounds.start),
          lt(stockMovements.createdAt, bounds.end),
        ),
      ),
    db
      .select({
        id: stockMovements.id,
        segment: stockMovements.segment,
        direction: stockMovements.direction,
        qty: stockMovements.qty,
        note: stockMovements.note,
        by: users.name,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(users, eq(users.id, stockMovements.createdByUserId))
      .where(eq(stockMovements.depotId, depotId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(8),
  ]);

  const bySeg = new Map(stockRows.map((r) => [r.segment, r]));
  const rows: StockRow[] = SEGMENT_ORDER.filter((seg) => bySeg.has(seg)).map((seg) => {
    const r = bySeg.get(seg)!;
    return { segment: seg, onHand: r.onHand, lowThreshold: r.lowThreshold };
  });

  const total = rows.reduce((s, r) => s + r.onHand, 0);
  const lowCount = rows.filter((r) => r.onHand < r.lowThreshold).length;
  const maxOnHand = rows.reduce((m, r) => Math.max(m, r.onHand), 0);

  return {
    rows,
    total,
    lowCount,
    movementsToday: todayCount.length,
    maxOnHand,
    recent: recentRows.map((r) => ({
      id: r.id,
      segment: r.segment,
      direction: r.direction,
      qty: r.qty,
      note: r.note,
      by: r.by,
      whenLabel: formatISTDate(r.createdAt),
    })),
  };
}

