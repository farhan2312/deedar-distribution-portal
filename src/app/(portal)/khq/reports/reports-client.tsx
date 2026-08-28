"use client";

import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapScopePickers } from "@/app/(portal)/_components/map-scope-pickers";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { useT } from "@/lib/i18n/provider";
import { Pagination } from "@/components/ui/pagination";
import type { StockistKind } from "@/db/schema";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { exportCountersCsv, exportVisitsCsv } from "@/lib/khq/report-actions";
// Types only — `reports.ts` is `server-only` and pulls in the DB driver, so a
// runtime import from it would drag `postgres`/`fs`/`net` into the client
// bundle and fail the build. Type imports are erased at compile time.
import type { CounterReportRow, ReportsScope, VisitReportRow } from "@/lib/khq/reports";

/** Fixed SKU order for the per-segment chips. Derived from the client-safe
 * products module rather than re-exported from `reports.ts` (see above). */
const SEGMENT_ORDER = PRODUCT_SEGMENTS.map((p) => p.value);

const STATUS_STYLE: Record<CounterReportRow["status"], { bg: string; color: string }> = {
  active: { bg: "rgba(30,158,90,.12)", color: "var(--success)" },
  dormant: { bg: "rgba(178,94,0,.1)", color: "var(--warning)" },
  declining: { bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
};

/** Turn a resolved server-action CSV payload into a browser download. Blob
 * URLs are session-scoped and freed on `revokeObjectURL`, so re-running the
 * export never leaks memory. */
function downloadCsv(filename: string, data: string) {
  // BOM so Excel recognises the UTF-8 encoding (Hindi rep/counter names
  // otherwise render as mojibake in the default Windows Excel install).
  const blob = new Blob(["﻿" + data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Same wording as the hierarchy screens, so a kind reads the same everywhere. */
const KIND_LABEL: Record<StockistKind, string> = {
  depot: "Depot",
  dealer: "Dealer",
  sub_dealer: "Sub-Dealer",
};

export function ReportsClient({
  scope,
  counters,
  countersTotal,
  visits,
  visitsTotal,
  pageSize,
}: {
  scope: ReportsScope;
  counters: CounterReportRow[];
  countersTotal: number;
  visits: VisitReportRow[];
  visitsTotal: number;
  pageSize: number;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Local copies for controlled inputs — kept in sync with the URL so a Back
  // button restore repopulates the fields.
  const [q, setQ] = useState(scope.filters.q);
  const [from, setFrom] = useState(scope.filters.fromDate);
  const [to, setTo] = useState(scope.filters.toDate);
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  const total = scope.tab === "counters" ? countersTotal : visitsTotal;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (scope.page - 1) * pageSize + 1;
  const lastRow = Math.min(scope.page * pageSize, total);

  /** Overwrite a set of params in one push (preserves everything else). Any
   * filter change resets to page 1 — staying on page 7 of a now-3-page result
   * would show an empty table. */
  function push(patch: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function switchTab(nextTab: "counters" | "visits") {
    if (nextTab === scope.tab) return;
    push({ tab: nextTab });
  }

  function applySearch(e: FormEvent) {
    e.preventDefault();
    push({ q: q.trim() || null });
  }

  function applyDates() {
    push({ from: from || null, to: to || null });
  }

  function clearDates() {
    setFrom("");
    setTo("");
    push({ from: null, to: null });
  }

  function goToPage(p: number) {
    push({ page: p <= 1 ? null : String(p) }, false);
  }

  function runExport() {
    setExportError(null);
    // Pass the CURRENT URL params through — the server action re-resolves the
    // same scope the page rendered, so the CSV matches the filters on screen
    // (minus pagination: export always covers every match).
    const payload = Object.fromEntries(params.entries());
    startExport(async () => {
      const res =
        scope.tab === "counters"
          ? await exportCountersCsv(payload)
          : await exportVisitsCsv(payload);
      if (!res.ok) {
        setExportError(res.error);
        return;
      }
      downloadCsv(res.filename, res.data);
    });
  }

  return (
    <div>
      {/* Own header (nav customHeader) so tabs + export sit on the title row. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{t("Reports")}</h1>
          <p className="page-subtitle max-w-2xl">
            {t("All counters and visits company-wide, exportable to CSV.")}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={runExport}
          disabled={exporting || total === 0}
        >
          {exporting ? t("Exporting…") : t("Export CSV")}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
        {(["counters", "visits"] as const).map((tk) => (
          <button
            key={tk}
            onClick={() => switchTab(tk)}
            className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
            style={{
              background: scope.tab === tk ? "var(--accent)" : "transparent",
              color: scope.tab === tk ? "#fff" : "var(--ink-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {tk === "counters" ? t("Counters") : t("Visits")}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
        <MapScopePickers levels={scope.levels} />
        <form onSubmit={applySearch} className="flex items-center gap-2">
          <input
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12, minWidth: 200 }}
            type="search"
            value={q}
            placeholder={
              scope.tab === "counters"
                ? t("Search counter name or mobile…")
                : t("Search counter or rep name…")
            }
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            {t("Search")}
          </button>
        </form>
        {scope.tab === "visits" && (
          <div className="flex items-center gap-2">
            <label className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("From")}</label>
            <input
              type="date"
              className="inp"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={applyDates}
            />
            <label className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("To")}</label>
            <input
              type="date"
              className="inp"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={applyDates}
            />
            {(from || to) && (
              <button type="button" className="link text-[12px]" onClick={clearDates}>
                {t("Clear dates")}
              </button>
            )}
          </div>
        )}
      </div>

      {exportError && (
        <p className="mb-3 text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>
          {exportError}
        </p>
      )}

      {/* Row-count summary */}
      <div className="mb-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        {total === 0
          ? scope.tab === "counters"
            ? t("No counters match these filters.")
            : t("No visits match these filters.")
          : `${t("Showing")} ${firstRow}–${lastRow} ${t("of")} ${total}`}
      </div>

      {scope.tab === "counters" ? (
        <CountersTable rows={counters} t={t} />
      ) : (
        <VisitsTable rows={visits} t={t} />
      )}

      {totalPages > 1 && (
        <Pagination page={scope.page} totalPages={totalPages} onGo={goToPage} t={t} />
      )}
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────

function CountersTable({ rows, t }: { rows: CounterReportRow[]; t: (k: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 1100 }}>
        <thead>
          <tr>
            {["Name", "Mobile", "Type", "Status", "Area", "Stockist", "C&F", "Created by", "Last visit", "Total visits"].map((h) => (
              <th key={h}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS_STYLE[r.status];
            const statusLabel =
              r.status === "active" ? t("Active") : r.status === "dormant" ? t("Dormant") : t("Declining");
            return (
              <tr key={r.id}>
                <td className="font-semibold">{r.name}</td>
                <td className="whitespace-nowrap tabular-nums">{r.phone ?? "—"}</td>
                <td>{t(r.type)}</td>
                <td>
                  <span className="chip" style={{ background: s.bg, color: s.color, borderColor: "transparent" }}>
                    {statusLabel}
                  </span>
                </td>
                <td>{r.areaName}</td>
                <td>
                  {r.stockistName}
                  <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {t(KIND_LABEL[r.stockistKind])}
                    {r.parentName ? ` · ${r.parentName}` : ""}
                  </div>
                </td>
                <td>{r.cnfName}</td>
                <td className="whitespace-nowrap">{r.createdByName ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {r.lastVisitAt ? formatISTDate(r.lastVisitAt) : "—"}
                </td>
                <td className="tabular-nums font-semibold">{r.totalVisits}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VisitsTable({ rows, t }: { rows: VisitReportRow[]; t: (k: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 1500 }}>
        <thead>
          <tr>
            {[
              "Date", "Rep", "Counter", "Counter Mobile", "Stockist", "Area", "C&F",
              "Products", "Total Stock", "Total Sold", "Rank",
              "Competitor", "Competitor Brand", "Remarks",
            ].map((h) => (
              <th key={h}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                {formatISTDate(r.visitedAt)} · {formatISTTime(r.visitedAt)}
              </td>
              <td className="whitespace-nowrap">{r.repName}</td>
              <td className="font-semibold">{r.counterName}</td>
              <td className="whitespace-nowrap tabular-nums">{r.counterPhone ?? "—"}</td>
              <td>
                {r.stockistName}
                <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {t(KIND_LABEL[r.stockistKind])}
                  {r.parentName ? ` · ${r.parentName}` : ""}
                </div>
              </td>
              <td>{r.areaName}</td>
              <td>{r.cnfName}</td>
              <td style={{ minWidth: 190 }}>
                <SegmentCells row={r} />
              </td>
              <td className="tabular-nums">{r.stock}</td>
              <td className="tabular-nums font-semibold">{r.sold}</td>
              <td className="tabular-nums">{r.rank ?? "—"}</td>
              <td className="whitespace-nowrap">{r.competitorLabel || "—"}</td>
              <td>{r.competitorBrand?.trim() || "—"}</td>
              <td style={{ maxWidth: 240 }}>
                <span className="block truncate" title={r.remarks ?? undefined}>
                  {r.remarks?.trim() || "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-SKU sold/stock as compact chips: "DG10 3/12". Segments the visit never
 * touched are omitted rather than shown as 0/0 — a rep who only sold DG10
 * shouldn't have three empty rows of noise in the cell. */
function SegmentCells({ row }: { row: VisitReportRow }) {
  const present = SEGMENT_ORDER.filter((seg) => row.segments[seg]);
  if (present.length === 0) return <span style={{ color: "var(--ink-3)" }}>—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {present.map((seg) => {
        const s = row.segments[seg]!;
        return (
          <span
            key={seg}
            className="rounded px-1.5 py-0.5 text-[11px] tabular-nums"
            style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
            title={`${seg} — sold ${s.sold}, stock ${s.stock}`}
          >
            <strong style={{ color: "var(--accent)" }}>{seg}</strong> {s.sold}/{s.stock}
          </span>
        );
      })}
    </span>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────

/** Page numbers to render: always first and last, the current page and its
 * neighbours, with `null` marking an ellipsis gap. Keeps the control a fixed
 * width no matter how many pages exist. */

