import "server-only";
import { and, asc, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
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
import type { ScopeLevel } from "@/lib/portal/map-scope";

export type CounterStatus = (typeof counterStatusEnum.enumValues)[number];
export type CounterType = (typeof counterTypeEnum.enumValues)[number];

/**
 * Kanpur HQ Reports — company-wide dumps of counters and visits, filterable
 * (C&F → Depot → Area + text search + optional date range on visits) and
 * exportable to CSV. Screen queries are paginated 50/page; the CSV export
 * pulls the full filtered set via a server action.
 */

export type ReportTab = "counters" | "visits";
export type ReportsParams = {
  tab?: string;
  cnf?: string;
  depot?: string;
  area?: string;
  q?: string;
  from?: string; // "YYYY-MM-DD" (IST); visits tab only
  to?: string;   // "YYYY-MM-DD" (IST); visits tab only
  page?: string; // 1-based; both tabs
};

/** Sanitised, resolved filters. `null` = "no restriction at this level". */
export type ReportsFilters = {
  cnfId: string | null;
  stockistId: string | null;
  areaId: string | null;
  q: string;
  /** Inclusive-exclusive UTC window derived from the from/to IST dates. Both
   * null means "all time" — the visits list defaults to unrestricted so the
   * viewer sees the full log, then narrows by picking dates. */
  visitFrom: Date | null;
  visitTo: Date | null;
  /** Original IST date strings so the UI keeps its inputs populated. */
  fromDate: string;
  toDate: string;
};

export type ReportsScope = {
  tab: ReportTab;
  filters: ReportsFilters;
  page: number;
  /** Levels rendered by `<MapScopePickers/>` — reused as-is. */
  levels: ScopeLevel[];
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

  const areaOptions = stockistId
    ? await db
        .select({ id: areas.id, name: areas.name })
        .from(areas)
        .where(eq(areas.stockistId, stockistId))
        .orderBy(asc(areas.name))
    : [];
  const areaId = pickId(areaOptions, params.area);

  // No default date window: visits are unrestricted unless the viewer picks
  // dates. Keeps the log honest — an empty result means the DB really is
  // empty, not that a helpful default has hidden yesterday's rows.
  const fromDate = normalizeDate(params.from) ?? "";
  const toDate = normalizeDate(params.to) ?? "";
  let visitFrom: Date | null = null;
  let visitTo: Date | null = null;
  if (fromDate && toDate) {
    [visitFrom, visitTo] = istDateRangeToUtc(fromDate, toDate);
  } else if (fromDate) {
    [visitFrom] = istDateRangeToUtc(fromDate, fromDate);
    // No upper bound → open-ended forward from this date.
  } else if (toDate) {
    // No lower bound → everything up to and including this date.
    const [, to] = istDateRangeToUtc(toDate, toDate);
    visitTo = to;
  }

  const filters: ReportsFilters = {
    cnfId,
    stockistId,
    areaId,
    q: (params.q ?? "").trim(),
    visitFrom,
    visitTo,
    fromDate,
    toDate,
  };

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const levels: ScopeLevel[] = [
    { key: "cnf", label: "C&F HQ", allLabel: "All C&F", options: allCnfs, value: cnfId ?? "all" },
    { key: "depot", label: "Stockist", allLabel: "All stockists", options: depotOptions, value: stockistId ?? "all" },
    { key: "area", label: "Area", allLabel: "All areas", options: areaOptions, value: areaId ?? "all" },
  ];

  return { tab, filters, page, levels };
}

// ── Counter fetch ───────────────────────────────────────────────────────

/** Counter predicate common to on-screen and CSV queries. */
function counterWhere(f: ReportsFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.areaId) parts.push(eq(counters.areaId, f.areaId));
  else if (f.stockistId) parts.push(eq(counters.stockistId, f.stockistId));
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
  if (f.visitFrom) parts.push(gte(visits.visitedAt, f.visitFrom));
  if (f.visitTo) parts.push(lt(visits.visitedAt, f.visitTo));
  if (f.areaId) parts.push(eq(counters.areaId, f.areaId));
  else if (f.stockistId) parts.push(eq(counters.stockistId, f.stockistId));
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

/** Accept "YYYY-MM-DD", reject anything else (undefined / bad format). */
function normalizeDate(s: string | undefined): string | null {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** IST calendar dates → UTC window `[start, endExclusive)` for `visited_at`.
 * Same fixed +5:30 offset the rest of the app uses. */
function istDateRangeToUtc(fromIst: string, toIst: string): [Date, Date] {
  // IST midnight is 18:30 UTC the previous day.
  const start = new Date(`${fromIst}T00:00:00+05:30`);
  const end = new Date(`${toIst}T00:00:00+05:30`);
  end.setUTCDate(end.getUTCDate() + 1); // end-of-day inclusive
  return [start, end];
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
