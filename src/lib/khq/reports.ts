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
import type { ScopeLevel } from "@/lib/portal/map-scope";
import type { PeriodKey } from "./periods";
import { resolveRange } from "./range";

export type CounterStatus = (typeof counterStatusEnum.enumValues)[number];
export type CounterType = (typeof counterTypeEnum.enumValues)[number];

/**
 * Kanpur HQ Reports — company-wide dumps of counters and visits, filterable
 * (C&F → Depot → Area + text search + period) and exportable to CSV. Screen
 * queries are paginated 50/page; the CSV export pulls the full filtered set
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
  cnf?: string;
  depot?: string;
  area?: string;
  q?: string;
  period?: string; // preset key; both tabs
  from?: string;   // "YYYY-MM-DD" (IST); both tabs
  to?: string;     // "YYYY-MM-DD" (IST); both tabs
  page?: string;   // 1-based; both tabs
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
};

export type ReportsScope = {
  tab: ReportTab;
  filters: ReportsFilters;
  page: number;
  /** Levels rendered by `<MapScopePickers/>` — reused as-is. */
  levels: ScopeLevel[];
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
 * segment so the CSV export can emit one pair of columns per SKU. Missing
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
  };

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const levels: ScopeLevel[] = [
    { key: "cnf", label: "C&F HQ", allLabel: "All C&F", options: allCnfs, value: cnfId ?? "all" },
    { key: "depot", label: "Stockist", allLabel: "All stockists", options: depotOptions, value: stockistId ?? "all" },
    { key: "area", label: "Area", allLabel: "All areas", options: areaOptions, value: areaId ?? "all" },
  ];

  return {
    tab,
    filters,
    page,
    levels,
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

/** Counter predicate common to on-screen and CSV queries. */
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
    .orderBy(desc(counters.createdAt));

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

function visitWhere(f: ReportsFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.from) parts.push(gte(visits.visitedAt, f.from));
  if (f.to) parts.push(lt(visits.visitedAt, f.to));
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
    .orderBy(desc(visits.visitedAt));

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

export async function countVisitsReport(f: ReportsFilters): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .innerJoin(users, eq(users.id, visits.userId))
    .where(visitWhere(f));
  return row?.n ?? 0;
}

// ── CSV serialisation ────────────────────────────────────────────────────

/** RFC 4180: quote if it contains a comma, quote, newline, or CR; double any
 * embedded quotes. Empty and pure-numeric values pass through untouched. */
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRows(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // \r\n so Excel on Windows opens without a "convert" prompt.
  return lines.join("\r\n") + "\r\n";
}

/**
 * A counter's ownership spread across three columns: sub-dealer, dealer,
 * depot. Only the ones that apply are filled, so a row says which kind of
 * stockist it belongs to without needing a separate "type" column.
 */
function stockistChain(r: { stockistName: string; stockistKind: StockistKind; parentName: string | null }) {
  if (r.stockistKind === "sub_dealer") return [r.stockistName, r.parentName ?? "", ""];
  if (r.stockistKind === "dealer") return ["", r.stockistName, ""];
  return ["", "", r.stockistName];
}

export function countersToCsv(rows: CounterReportRow[]): string {
  return csvRows(
    [
      "Name", "Mobile", "Type", "Status",
      "Area", "Sub-Dealer", "Dealer", "Depot", "C&F",
      "Address", "Latitude", "Longitude",
      "Created by", "Created at", "Last visit", "Total visits",
    ],
    rows.map((r) => [
      r.name,
      r.phone ?? "",
      r.type,
      r.status,
      r.areaName,
      ...stockistChain(r),
      r.cnfName,
      r.address ?? "",
      r.lat ?? "",
      r.lng ?? "",
      r.createdByName ?? "",
      formatIstDdMmYyyy(r.createdAt),
      r.lastVisitAt ? formatIstDdMmYyyy(r.lastVisitAt) : "",
      r.totalVisits,
    ]),
  );
}

/** Segments in a fixed order so every CSV row has the same columns in the
 * same positions, even when a visit didn't touch a SKU. */
const SEGMENT_ORDER: ProductSegment[] = PRODUCT_SEGMENTS.map((p) => p.value);

export function visitsToCsv(rows: VisitReportRow[]): string {
  const header = [
    "Date",
    "Rep",
    "Mobile (rep)",
    "Counter",
    "Counter Mobile",
    "Area",
    "Sub-Dealer",
    "Dealer",
    "Depot",
    "C&F",
  ];
  for (const seg of SEGMENT_ORDER) {
    header.push(`${seg} Sold`, `${seg} Stock`);
  }
  header.push(
    "Total Sold",
    "Total Stock",
    "Rank",
    // Competitor split into its own two columns so a downstream spreadsheet
    // can filter by presence separately from the free-text brand name.
    "Competitor",
    "Competitor Brand",
    "Duration (mm:ss)",
    "Remarks",
  );

  return csvRows(
    header,
    rows.map((r) => {
      const line: (string | number | null | undefined)[] = [
        formatIstDdMmYyyy(r.visitedAt),
        r.repName,
        r.repPhone,
        r.counterName,
        r.counterPhone ?? "",
        r.areaName,
        ...stockistChain(r),
        r.cnfName,
      ];
      for (const seg of SEGMENT_ORDER) {
        const s = r.segments[seg];
        line.push(s?.sold ?? 0, s?.stock ?? 0);
      }
      line.push(
        r.sold,
        r.stock,
        r.rank ?? "",
        r.competitorLabel,
        // Brand is meaningful only when a competitor is present; blank
        // otherwise so "None" rows don't have stray brand text.
        r.competitor && r.competitor !== "none" ? (r.competitorBrand ?? "").trim() : "",
        formatMmSs(r.durationSeconds),
        r.remarks ?? "",
      );
      return line;
    }),
  );
}

/** "mm:ss" from whole seconds — blank on null so unmeasured (legacy or
 * edited) visits export as empty cells rather than "0:00". */
function formatMmSs(seconds: number | null): string {
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

/** "dd/mm/yyyy" in IST — used for the Counters CSV date columns so the
 * exported value matches how the same date reads on screen (India calendar
 * day), not the raw UTC instant. */
function formatIstDdMmYyyy(d: Date): string {
  // en-GB happens to render exactly dd/mm/yyyy with no locale surprises.
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function segmentBreakdown(items: VisitItem[] | null | undefined): SegmentBreakdown {
  const out: SegmentBreakdown = {};
  for (const it of items ?? []) out[it.segment] = { sold: it.sold, stock: it.stock };
  return out;
}

// Re-export shared types so page/client code doesn't reach into schema.ts.
export type { ProductSegment, VisitItem };
export { SEGMENT_ORDER };
