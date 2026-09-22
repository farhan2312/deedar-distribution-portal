import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  counterStatusEnum,
  counterTypeEnum,
  stockists,
  users,
  visits,
  type ProductSegment,
  type StockistKind,
  type VisitItem,
} from "@/db/schema";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { COMPETITOR_LABEL, PRODUCT_SEGMENTS } from "@/lib/field/products";
import { areaOptionsFor, withSubDealers } from "@/lib/portal/area-options";
import { isCounterSort, type CounterSort } from "./report-sorts";

export { COUNTER_SORTS, isCounterSort, type CounterSort } from "./report-sorts";
import type { ScopeLevel } from "@/lib/portal/map-scope";
import type { PeriodKey } from "./periods";
import { resolveRange } from "./range";

export type CounterStatus = (typeof counterStatusEnum.enumValues)[number];
export type CounterType = (typeof counterTypeEnum.enumValues)[number];

/**
 * Kanpur HQ Reports — company-wide dumps of counters and visits, filterable
 * (C&F → Depot → Area + text search + period) and exportable to Excel. Screen
 * queries are paginated 50/page; the Excel export pulls the full filtered set
 * via a server action.
 *
 * The period applies to both tabs, against the date each tab is actually about:
 * when a counter was created, and when a visit happened. It defaults to All
 * time — a report that silently hides last year's rows is a report nobody can
 * trust — so the filter only ever narrows what you would otherwise see.
 */

export type ReportTab = "counters" | "visits";
export type ReportsParams = {
  tab?: string;
  sort?: string;  // counters tab ordering
  cnf?: string;
  depot?: string;
  area?: string;
  q?: string;
  period?: string; // preset key; both tabs
  from?: string;   // "YYYY-MM-DD" (IST); both tabs
  to?: string;     // "YYYY-MM-DD" (IST); both tabs
  page?: string;   // 1-based; both tabs
  isr?: string;    // visits tab: the rep who made the visit
};

/** Sanitised, resolved filters. `null` = "no restriction at this level". */
export type ReportsFilters = {
  cnfId: string | null;
  /** The chosen stockist, plus its sub-dealers when it is a dealer. Null =
   * no restriction at this level. */
  stockistIds: string[] | null;
  areaId: string | null;
  q: string;
  /** Inclusive-exclusive UTC window for the selected period. Both null on
   * "All time", so that preset puts no bound in the SQL at all rather than a
   * bound that merely happens to cover every row. */
  from: Date | null;
  to: Date | null;
  /** Visits tab only: the ISR who made the visit. */
  isrId: string | null;
};

export type IsrOption = { id: string; name: string; isActive: boolean };

export type ReportsScope = {
  tab: ReportTab;
  filters: ReportsFilters;
  page: number;
  /** Counters-tab ordering, chosen in the filter row. */
  sort: CounterSort;
  /** Levels rendered by `<MapScopePickers/>` — reused as-is. */
  levels: ScopeLevel[];
  /**
   * Visits tab: everyone with at least one visit inside the chosen C&F /
   * stockist / area — deactivated reps included, since a report on last month
   * has to be able to show someone who has since left. Empty on the counters
   * tab, which has no rep to filter by.
   */
  isrOptions: IsrOption[];
  /** Everything `<PeriodFilter/>` needs to render its own state. */
  period: {
    key: PeriodKey | null;
    from: string;
    to: string;
    minDate: string;
    maxDate: string;
    label: string;
  };
};

/** Per-segment (sold/stock) breakdown parsed out of `visits.items`, indexed by
 * segment so the Excel export can emit one pair of columns per SKU. Missing
 * segments are treated as (0, 0) both on screen and in export. */
export type SegmentBreakdown = Partial<Record<ProductSegment, { sold: number; stock: number }>>;

export type CounterReportRow = {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  status: CounterStatus;
  areaName: string;
  stockistName: string;
  stockistKind: StockistKind;
  /** Parent dealer's name when the stockist is a sub-dealer, else null. */
  parentName: string | null;
  cnfName: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  createdByName: string | null;
  createdAt: Date;
  lastVisitAt: Date | null;
  totalVisits: number;
};

export type VisitReportRow = {
  id: string;
  visitedAt: Date;
  counterName: string;
  counterPhone: string | null;
  repName: string;
  repPhone: string;
  areaName: string;
  stockistName: string;
  stockistKind: StockistKind;
  parentName: string | null;
  cnfName: string;
  sold: number;
  stock: number;
  rank: number | null;
  /** Raw enum value — used to know if a competitor is present at all. */
  competitor: string | null;
  competitorLabel: string;
  competitorBrand: string | null;
  remarks: string | null;
  /** Seconds spent on the counter — null on legacy rows recorded before the
   * timer existed, or on edits (kept from the original visit). */
  durationSeconds: number | null;
  items: VisitItem[];
  segments: SegmentBreakdown;
};

/** Rows per page for both tabs. */
export const REPORT_PAGE_SIZE = 50;

/**
 * Read URL params and produce the resolved scope + level metadata for the
 * pickers. Cascades depot/area option lists on the server the same way the
 * map pages do.
 */
export async function resolveReportsScope(params: ReportsParams): Promise<ReportsScope> {
  const tab: ReportTab = params.tab === "visits" ? "visits" : "counters";

  const allCnfs = await db
    .select({ id: cnfs.id, name: cnfs.name })
    .from(cnfs)
    .orderBy(asc(cnfs.name));
  const cnfId = pickId(allCnfs, params.cnf);

  const cnfStockists = cnfId
    ? await db
        .select({ id: stockists.id, name: stockists.name })
        .from(stockists)
        .where(eq(stockists.cnfId, cnfId))
        .orderBy(asc(stockists.name))
    : [];
  const depotOptions = cnfId ? cnfStockists : [];
  const stockistId = pickId(depotOptions, params.depot);

  // A dealer carries its sub-dealers: their areas belong to that dealer's
  // territory, so they are listed (under their own heading) and their counters
  // stay in scope.
  const stockistIds = stockistId ? await withSubDealers([stockistId]) : null;
  const areaOptions = stockistIds ? await areaOptionsFor(stockistIds) : [];
  const areaId = pickId(areaOptions, params.area);

  // Validated against the options like every other level, so an ISR left in
  // the URL from a different C&F or stockist is ignored rather than returning
  // an empty report.
  const isrOptions = tab === "visits" ? await visitAuthorsIn({ cnfId, stockistIds, areaId }) : [];
  const isrId = pickId(isrOptions, params.isr);

  // The calendar floor is the oldest counter in the system: every visit's
  // counter existed before the visit, so this bounds both tabs.
  const [oldest] = await db
    .select({ d: sql<string | null>`min(${counters.createdAt} AT TIME ZONE 'Asia/Kolkata')::date::text` })
    .from(counters);

  // Defaults to "all", the one preset that leaves the SQL unbounded.
  const range = resolveRange(params, oldest?.d ?? null, "all");
  const unbounded = range.period === "all";

  const filters: ReportsFilters = {
    cnfId,
    stockistIds,
    areaId,
    q: (params.q ?? "").trim(),
    from: unbounded ? null : range.start,
    to: unbounded ? null : range.end,
    isrId,
  };

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort: CounterSort = isCounterSort(params.sort) ? params.sort : "new";

  const levels: ScopeLevel[] = [
    { key: "cnf", label: "C&F HQ", allLabel: "All C&F", options: allCnfs, value: cnfId ?? "all" },
    { key: "depot", label: "Stockist", allLabel: "All stockists", options: depotOptions, value: stockistId ?? "all" },
    { key: "area", label: "Area", allLabel: "All areas", options: areaOptions, value: areaId ?? "all" },
  ];

  return {
    tab,
    filters,
    page,
    sort,
    levels,
    isrOptions,
    period: {
      key: range.period,
      from: range.from,
      to: range.to,
      minDate: range.minDate,
      maxDate: range.maxDate,
      label: range.label,
    },
  };
}

// ── Counter fetch ───────────────────────────────────────────────────────

/** Counter predicate common to on-screen and export queries. */
function counterWhere(f: ReportsFilters): SQL | undefined {
  const parts: SQL[] = [];
  // A counter's date is when it was created — the only date it has.
  if (f.from) parts.push(gte(counters.createdAt, f.from));
  if (f.to) parts.push(lt(counters.createdAt, f.to));
  if (f.areaId) parts.push(eq(counters.areaId, f.areaId));
  else if (f.stockistIds) parts.push(inArray(counters.stockistId, f.stockistIds));
  else if (f.cnfId) parts.push(eq(stockists.cnfId, f.cnfId));
  if (f.q) {
    const like = `%${f.q}%`;
    // Search matches counter name OR phone — the two things a human types.
    parts.push(or(ilike(counters.name, like), ilike(counters.phone, like))!);
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export type PageOpts = { limit: number; offset: number };

export async function fetchCountersReport(
  f: ReportsFilters,
  opts?: PageOpts,
  sort: CounterSort = "new",
): Promise<CounterReportRow[]> {
  // `creator` alias so the LEFT JOIN on the counter's author never collides
  // with any other users-table reference we might add later.
  const creator = alias(users, "counter_creator");
  const parentStockist = alias(stockists, "parent_stockist");
  // Correlated subquery so the visit count comes back with the row rather
  // than needing a second round-trip. Fine on tens of thousands of counters;
  // if that ever hurts we can move to a windowed aggregate.
  const totalVisits = sql<number>`(SELECT count(*)::int FROM ${visits} WHERE ${visits.counterId} = ${counters.id})`;

  const query = db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      typeOther: counters.typeOther,
      status: counters.status,
      areaName: areas.name,
      stockistName: stockists.name,
      stockistKind: stockists.kind,
      parentName: parentStockist.name,
      cnfName: cnfs.name,
      address: counters.address,
      lat: counters.lat,
      lng: counters.lng,
      createdByName: creator.name,
      createdAt: counters.createdAt,
      lastVisitAt: counters.lastVisitAt,
      totalVisits: totalVisits,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    // Self-join for a sub-dealer's parent dealer, so the report can show the
    // whole chain rather than just the immediate owner.
    .leftJoin(parentStockist, eq(parentStockist.id, stockists.parentId))
    .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
    .leftJoin(creator, eq(creator.id, counters.createdByUserId))
    .where(counterWhere(f))
    // The id tiebreaker is not decoration: hundreds of counters share a visit
    // count and many share a creation timestamp, and paging a non-total order
    // drops and repeats rows between pages.
    .orderBy(
      ...(sort === "visits"
        ? [desc(totalVisits), asc(counters.id)]
        : sort === "least"
          ? [asc(totalVisits), asc(counters.id)]
          : [desc(counters.createdAt), asc(counters.id)]),
    );

  const rows = opts ? await query.limit(opts.limit).offset(opts.offset) : await query;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    type: counterTypeLabel(r.type, r.typeOther),
    status: r.status,
    areaName: r.areaName,
    stockistName: r.stockistName,
    stockistKind: r.stockistKind,
    parentName: r.parentName,
    cnfName: r.cnfName,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
    lastVisitAt: r.lastVisitAt,
    totalVisits: r.totalVisits ?? 0,
  }));
}

// ── Visit fetch ─────────────────────────────────────────────────────────

/**
 * Reps with at least one visit inside a place — the ISR filter's options.
 *
 * Taken from the visits themselves rather than from users with the field
 * role: a rep who was deactivated, moved stockist or lost the role still has
 * visits here, and every name offered is one that returns rows. Period and
 * search are left out on purpose, so the list does not reshuffle while the
 * dates are being adjusted.
 */
async function visitAuthorsIn(p: {
  cnfId: string | null;
  stockistIds: string[] | null;
  areaId: string | null;
}): Promise<IsrOption[]> {
  const where = p.areaId
    ? eq(counters.areaId, p.areaId)
    : p.stockistIds
      ? inArray(counters.stockistId, p.stockistIds)
      : p.cnfId
        ? eq(stockists.cnfId, p.cnfId)
        : undefined;
  return db
    .selectDistinct({ id: users.id, name: users.name, isActive: users.isActive })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(where)
    .orderBy(asc(users.name), asc(users.id));
}

function visitWhere(f: ReportsFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.from) parts.push(gte(visits.visitedAt, f.from));
  if (f.to) parts.push(lt(visits.visitedAt, f.to));
  if (f.isrId) parts.push(eq(visits.userId, f.isrId));
  if (f.areaId) parts.push(eq(counters.areaId, f.areaId));
  else if (f.stockistIds) parts.push(inArray(counters.stockistId, f.stockistIds));
  else if (f.cnfId) parts.push(eq(stockists.cnfId, f.cnfId));
  if (f.q) {
    const like = `%${f.q}%`;
    parts.push(or(ilike(counters.name, like), ilike(users.name, like))!);
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export async function fetchVisitsReport(
  f: ReportsFilters,
  opts?: PageOpts,
): Promise<VisitReportRow[]> {
  const parentStockist = alias(stockists, "parent_stockist");
  const query = db
    .select({
      id: visits.id,
      visitedAt: visits.visitedAt,
      counterName: counters.name,
      counterPhone: counters.phone,
      repName: users.name,
      repPhone: users.phone,
      areaName: areas.name,
      stockistName: stockists.name,
      stockistKind: stockists.kind,
      parentName: parentStockist.name,
      cnfName: cnfs.name,
      sold: visits.sold,
      stock: visits.stock,
      rank: visits.rank,
      competitor: visits.competitor,
      competitorBrand: visits.competitorBrand,
      remarks: visits.remarks,
      durationSeconds: visits.durationSeconds,
      items: visits.items,
    })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(users, eq(users.id, visits.userId))
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    // Self-join for a sub-dealer's parent dealer, so the report can show the
    // whole chain rather than just the immediate owner.
    .leftJoin(parentStockist, eq(parentStockist.id, stockists.parentId))
    .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
    .where(visitWhere(f))
    // Tiebreaker, as above — visits recorded in the same second would
    // otherwise straddle a page boundary unpredictably.
    .orderBy(desc(visits.visitedAt), asc(visits.id));

  const rows = opts ? await query.limit(opts.limit).offset(opts.offset) : await query;

  return rows.map((r) => ({
    id: r.id,
    visitedAt: r.visitedAt,
    counterName: r.counterName,
    counterPhone: r.counterPhone,
    repName: r.repName,
    repPhone: r.repPhone,
    areaName: r.areaName,
    stockistName: r.stockistName,
    stockistKind: r.stockistKind,
    parentName: r.parentName,
    cnfName: r.cnfName,
    sold: r.sold,
    stock: r.stock,
    rank: r.rank,
    competitor: r.competitor,
    competitorLabel: competitorLabel(r.competitor),
    competitorBrand: r.competitorBrand,
    remarks: r.remarks,
    durationSeconds: r.durationSeconds,
    items: r.items,
    segments: segmentBreakdown(r.items),
  }));
}

/** Total row count for the currently-filtered scope — feeds the pagination
 * footer and the "N results" summary. */
export async function countCountersReport(f: ReportsFilters): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(counters)
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(counterWhere(f));
  return row?.n ?? 0;
}

export type VisitsTotals = {
  count: number;
  sold: number;
  /** Sold per SKU, every SKU present (0 when none sold), in SEGMENT_ORDER. */
  bySku: Record<ProductSegment, number>;
};

/**
 * How many visits match, and how much they sold between them — in total and
 * per SKU — across the whole filtered set, not the fifty rows on screen.
 *
 * One query for all of it, since every figure shares the same filters and
 * joins. The per-SKU sums read each visit's `items`, where the SKU split
 * lives; `visits.sold` is that split added up at write time, so the SKU sums
 * always add up to the total (checked against every visit on record: none
 * differ, none carry a total without a split).
 */
export async function visitsReportTotals(f: ReportsFilters): Promise<VisitsTotals> {
  const skuSold = (seg: ProductSegment) =>
    sql<number>`coalesce(sum((
      select coalesce(sum((it->>'sold')::int), 0)
      from jsonb_array_elements(${visits.items}) it
      where it->>'segment' = ${seg}
    )), 0)::int`;

  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
      sold: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
      DG10: skuSold("DG10"),
      DG20: skuSold("DG20"),
      DB20: skuSold("DB20"),
      DB40: skuSold("DB40"),
    })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .innerJoin(users, eq(users.id, visits.userId))
    .where(visitWhere(f));

  const bySku = Object.fromEntries(
    SEGMENT_ORDER.map((seg) => [seg, row?.[seg as "DG10"] ?? 0]),
  ) as Record<ProductSegment, number>;
  return { count: row?.n ?? 0, sold: row?.sold ?? 0, bySku };
}

// ── Export helpers ─────────────────────────────────────────────────────

/**
 * A counter's ownership spread across three columns: sub-dealer, dealer,
 * depot. Only the ones that apply are filled, so a row says which kind of
 * stockist it belongs to without needing a separate "type" column.
 */
export function stockistChain(r: { stockistName: string; stockistKind: StockistKind; parentName: string | null }) {
  if (r.stockistKind === "sub_dealer") return [r.stockistName, r.parentName ?? "", ""];
  if (r.stockistKind === "dealer") return ["", r.stockistName, ""];
  return ["", "", r.stockistName];
}

/** Segments in a fixed order so every export row has the same columns in the
 * same positions, even when a visit didn't touch a SKU. */
const SEGMENT_ORDER: ProductSegment[] = PRODUCT_SEGMENTS.map((p) => p.value);

/** "mm:ss" from whole seconds — blank on null so unmeasured (legacy or
 * edited) visits export as empty cells rather than "0:00". */
export function formatMmSs(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function pickId<T extends { id: string }>(options: T[], requested: string | undefined): string | null {
  if (!requested || requested === "all") return null;
  return options.some((o) => o.id === requested) ? requested : null;
}

function competitorLabel(c: string | null): string {
  if (!c) return "";
  return COMPETITOR_LABEL[c as keyof typeof COMPETITOR_LABEL] ?? c;
}

function segmentBreakdown(items: VisitItem[] | null | undefined): SegmentBreakdown {
  const out: SegmentBreakdown = {};
  for (const it of items ?? []) out[it.segment] = { sold: it.sold, stock: it.stock };
  return out;
}

// Re-export shared types so page/client code doesn't reach into schema.ts.
export type { ProductSegment, VisitItem };
export { SEGMENT_ORDER };
