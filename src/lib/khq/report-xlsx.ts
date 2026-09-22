import "server-only";
import ExcelJS from "exceljs";
import { COUNTER_SORTS } from "./report-sorts";
import {
  SEGMENT_ORDER,
  formatMmSs,
  stockistChain,
  type CounterReportRow,
  type ReportsScope,
  type VisitReportRow,
} from "./reports";

/**
 * Kanpur HQ report exports as real Excel workbooks.
 *
 * These replaced CSV, which cannot carry any formatting — the header and the
 * cumulative row looked exactly like data. What a workbook adds, and why:
 *
 * - A title block naming the report, the filters that produced it and when.
 *   A file passed around on WhatsApp has to explain itself; "visits.csv" does
 *   not say which stockist or period it covers.
 * - A coloured header, frozen with the first columns, with filter buttons, so
 *   the sheet can be scrolled and narrowed without losing its bearings.
 * - The cumulative as a distinct TOTAL row built from SUBTOTAL formulas, which
 *   add up only the rows left visible — filter the sheet to one rep and the
 *   totals follow, instead of still showing everyone's.
 * - Real dates and numbers, so they sort and sum; mobile numbers as text, so
 *   Excel never turns them into 9.52E+09.
 */

// ── Palette ─────────────────────────────────────────────────────────────
// ARGB. Chosen for a printed page as much as a screen: a dark header that
// holds white text, and a warm total row that cannot be mistaken for either
// the header or a data row.
const NAVY = "FF1F3A5F";
const PRODUCT = "FF2E5C8A"; // the SKU columns, a shade apart from the rest
const WHITE = "FFFFFFFF";
const BAND = "FFF4F6F9";
const GRID = "FFD9DEE5";
const TOTAL_FILL = "FFFCE4B6";
const TOTAL_INK = "FF3B2A05";
const MUTED = "FF5B6573";

/** Header sits on row 5: title, scope and timestamp above, one blank between. */
const HEADER_ROW = 5;

type Kind = "text" | "number" | "date";
type Column = { header: string; width: number; kind?: Kind; product?: boolean };
type Cell = string | number | Date | null;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** The IST calendar day as an Excel date. Excel dates have no zone, and
 * exceljs writes a JS Date by its UTC day — so the IST day is rebuilt at UTC
 * midnight, and a 1 a.m. IST visit stays on the day it happened. */
function istDay(d: Date): Date {
  const [y, m, day] = d
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function generatedAt(): string {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jhalawar_RJ › Indergarh · ISR: … · Period: All time · Search: "…"" — the
 * filters as the screen had them, so the sheet says what it is a report of. */
function scopeLine(scope: ReportsScope, extra: string[] = []): string {
  const place = scope.levels
    .filter((l) => l.value !== "all")
    .map((l) => l.options.find((o) => o.id === l.value)?.name)
    .filter(Boolean);
  const parts = [place.length > 0 ? place.join(" › ") : "All C&F HQs", ...extra];
  parts.push(`Period: ${scope.period.label}`);
  if (scope.filters.q) parts.push(`Search: "${scope.filters.q}"`);
  return parts.join("   ·   ");
}

type SheetSpec = {
  sheetName: string;
  title: string;
  subtitle: string;
  columns: Column[];
  rows: Cell[][];
  /** What a row is, plural — "visits", "counters". */
  noun: string;
  /** Columns kept in view while scrolling right. */
  freezeColumns: number;
  /** Adds the TOTAL row: a label across the first `labelSpan` columns, and a
   * SUBTOTAL under each listed column (0-based). */
  total?: { labelSpan: number; sumColumns: number[] };
};

async function buildWorkbook(spec: SheetSpec): Promise<string> {
  const { columns, rows } = spec;
  const wb = new ExcelJS.Workbook();
  wb.creator = "D-Drive";
  wb.created = new Date();
  // SUBTOTAL results are written with the file, but a recalculation on open
  // keeps them right if anything ever reads the sheet before Excel does.
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet(spec.sheetName, {
    views: [
      { state: "frozen", xSplit: spec.freezeColumns, ySplit: HEADER_ROW, showGridLines: false },
    ],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    },
  });
  ws.columns = columns.map((c) => ({ width: c.width }));

  // ── Title block ───────────────────────────────────────────────────────
  const title = ws.getCell(1, 1);
  title.value = spec.title;
  title.font = { bold: true, size: 15, color: { argb: NAVY } };
  ws.getRow(1).height = 24;

  const sub = ws.getCell(2, 1);
  sub.value = spec.subtitle;
  sub.font = { size: 10, color: { argb: MUTED } };

  const noun = spec.noun;
  const stamp = ws.getCell(3, 1);
  stamp.value = `${rows.length.toLocaleString("en-IN")} ${noun}   ·   Generated ${generatedAt()} IST`;
  stamp.font = { size: 10, italic: true, color: { argb: MUTED } };

  // ── Header ────────────────────────────────────────────────────────────
  const header = ws.getRow(HEADER_ROW);
  header.height = 32;
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.fill = solid(c.product ? PRODUCT : NAVY);
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.alignment = {
      vertical: "middle",
      horizontal: c.kind === "number" ? "center" : "left",
      wrapText: true,
    };
    cell.border = { right: { style: "thin", color: { argb: WHITE } } };
  });

  // ── Data ──────────────────────────────────────────────────────────────
  rows.forEach((values, ri) => {
    const row = ws.getRow(HEADER_ROW + 1 + ri);
    const banded = ri % 2 === 1;
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v === "" ? null : v;
      const kind = columns[ci].kind ?? "text";
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: kind === "number" ? "right" : "left" };
      if (kind === "number") cell.numFmt = "#,##0";
      if (kind === "date") cell.numFmt = "dd-mmm-yyyy";
      if (banded) cell.fill = solid(BAND);
      cell.border = { bottom: { style: "hair", color: { argb: GRID } } };
    });
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + rows.length;

  // Filter buttons cover the data only — never the TOTAL row, which must not
  // be sorted in among the rows it adds up.
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: last, column: columns.length } };
  }

  // ── TOTAL ─────────────────────────────────────────────────────────────
  if (spec.total && rows.length > 0) {
    const { labelSpan, sumColumns } = spec.total;
    const at = last + 2; // one blank row keeps it out of Excel's "current region"
    const tr = ws.getRow(at);
    tr.height = 22;

    for (let c = 1; c <= columns.length; c++) {
      const cell = tr.getCell(c);
      cell.fill = solid(TOTAL_FILL);
      cell.font = { bold: true, size: 11, color: { argb: TOTAL_INK } };
      cell.border = {
        top: { style: "medium", color: { argb: NAVY } },
        bottom: { style: "double", color: { argb: NAVY } },
      };
      cell.alignment = { vertical: "middle", horizontal: c <= labelSpan ? "left" : "right" };
    }

    ws.mergeCells(at, 1, at, labelSpan);
    const firstCol = ws.getColumn(1).letter;
    // SUBTOTAL(103 / 109) count and sum the VISIBLE rows only, so the label and
    // every figure track whatever the sheet is filtered to.
    tr.getCell(1).value = {
      formula: `"TOTAL — "&TEXT(SUBTOTAL(103,${firstCol}${first}:${firstCol}${last}),"#,##0")&" ${noun}"`,
      result: `TOTAL — ${rows.length.toLocaleString("en-IN")} ${noun}`,
    };
    for (const ci of sumColumns) {
      const letter = ws.getColumn(ci + 1).letter;
      const sum = rows.reduce((n, r) => n + (typeof r[ci] === "number" ? (r[ci] as number) : 0), 0);
      const cell = tr.getCell(ci + 1);
      cell.value = { formula: `SUBTOTAL(109,${letter}${first}:${letter}${last})`, result: sum };
      cell.numFmt = "#,##0";
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer).toString("base64");
}

// ── Visits ──────────────────────────────────────────────────────────────

export async function visitsWorkbook(rows: VisitReportRow[], scope: ReportsScope): Promise<string> {
  const identity: Column[] = [
    { header: "Date", width: 13, kind: "date" },
    { header: "Rep", width: 22 },
    { header: "Mobile (rep)", width: 13 },
    { header: "Counter", width: 26 },
    { header: "Counter Mobile", width: 14 },
    { header: "Area", width: 18 },
    { header: "Sub-Dealer", width: 16 },
    { header: "Dealer", width: 16 },
    { header: "Depot", width: 16 },
    { header: "C&F", width: 14 },
  ];
  const product: Column[] = SEGMENT_ORDER.flatMap((seg) => [
    { header: `${seg} Sold`, width: 10, kind: "number" as const, product: true },
    { header: `${seg} Stock`, width: 10, kind: "number" as const, product: true },
  ]);
  const rest: Column[] = [
    { header: "Total Sold", width: 11, kind: "number" },
    { header: "Total Stock", width: 11, kind: "number" },
    { header: "Rank", width: 7, kind: "number" },
    { header: "Competitor", width: 15 },
    { header: "Competitor Brand", width: 17 },
    { header: "Duration (mm:ss)", width: 11 },
    { header: "Remarks", width: 34 },
  ];
  const columns = [...identity, ...product, ...rest];

  const data: Cell[][] = rows.map((r) => [
    istDay(r.visitedAt),
    r.repName,
    r.repPhone,
    r.counterName,
    r.counterPhone ?? "",
    r.areaName,
    ...stockistChain(r),
    r.cnfName,
    ...SEGMENT_ORDER.flatMap((seg) => [r.segments[seg]?.sold ?? 0, r.segments[seg]?.stock ?? 0]),
    r.sold,
    r.stock,
    r.rank ?? null,
    r.competitorLabel,
    // Brand only when a competitor is present — no stray text on "None" rows.
    r.competitor && r.competitor !== "none" ? (r.competitorBrand ?? "").trim() : "",
    formatMmSs(r.durationSeconds),
    r.remarks ?? "",
  ]);

  const isr = scope.filters.isrId
    ? scope.isrOptions.find((o) => o.id === scope.filters.isrId)?.name
    : null;

  // Every SKU pair plus Total Sold / Total Stock; Rank is a position, not a quantity.
  const sumColumns = [...product, rest[0], rest[1]].map((c) => columns.indexOf(c));

  return buildWorkbook({
    sheetName: "Visits",
    title: "Visits report",
    subtitle: scopeLine(scope, isr ? [`ISR: ${isr}`] : []),
    columns,
    rows: data,
    noun: "visits",
    freezeColumns: 2, // Date and Rep stay in view across the SKU columns
    total: { labelSpan: identity.length, sumColumns },
  });
}

// ── Counters ────────────────────────────────────────────────────────────

export async function countersWorkbook(rows: CounterReportRow[], scope: ReportsScope): Promise<string> {
  const columns: Column[] = [
    { header: "Name", width: 28 },
    { header: "Mobile", width: 13 },
    { header: "Type", width: 13 },
    { header: "Status", width: 11 },
    { header: "Area", width: 18 },
    { header: "Sub-Dealer", width: 16 },
    { header: "Dealer", width: 16 },
    { header: "Depot", width: 16 },
    { header: "C&F", width: 14 },
    { header: "Address", width: 32 },
    { header: "Latitude", width: 11 },
    { header: "Longitude", width: 11 },
    { header: "Created by", width: 18 },
    { header: "Created at", width: 13, kind: "date" },
    { header: "Last visit", width: 13, kind: "date" },
    { header: "Total visits", width: 10, kind: "number" },
  ];

  const data: Cell[][] = rows.map((r) => [
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
    istDay(r.createdAt),
    r.lastVisitAt ? istDay(r.lastVisitAt) : null,
    r.totalVisits,
  ]);

  const sort = COUNTER_SORTS.find((s) => s.key === scope.sort)?.label ?? "Newest first";
  return buildWorkbook({
    sheetName: "Counters",
    title: "Counters report",
    subtitle: scopeLine(scope, [`Order: ${sort}`]),
    columns,
    rows: data,
    noun: "counters",
    freezeColumns: 1,
  });
}
