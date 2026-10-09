"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapScopePickers } from "@/app/(portal)/_components/map-scope-pickers";
import { AddCounterButton } from "../_components/admin-forms";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { useT } from "@/lib/i18n/provider";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { PeriodFilter } from "../_components/period-filter";
import { COUNTER_SORTS } from "@/lib/khq/report-sorts";
import type { StockistKind } from "@/db/schema";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { exportCountersXlsx, exportVisitsXlsx } from "@/lib/khq/report-actions";
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

/** Turn a finished workbook (base64 from the server action) into a browser
 * download. Blob URLs are session-scoped and freed on `revokeObjectURL`, so
 * re-running the export never leaks memory. */
function downloadXlsx(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  visitsSold,
  visitsSoldBySku,
  pageSize,
  canAddCounter = false,
}: {
  scope: ReportsScope;
  counters: CounterReportRow[];
  countersTotal: number;
  visits: VisitReportRow[];
  visitsTotal: number;
  /** Packets sold across every matching visit, all pages. */
  visitsSold: number;
  /** The same, per SKU. */
  visitsSoldBySku: Record<(typeof SEGMENT_ORDER)[number], number>;
  pageSize: number;
  /** Central Admin only — entering a counter on behalf of a rep who had no
   * signal to add it themselves. */
  canAddCounter?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  // Same treatment as the period pills: highlight on click, not on the
  // server's answer. `useOptimistic` falls back to `scope.tab` once the new page
  // lands, so a failed navigation can't strand the wrong pill lit.
  const [navigating, startNav] = useTransition();
  const [shownTab, showTab] = useOptimistic(scope.tab);

  const total = scope.tab === "counters" ? countersTotal : visitsTotal;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (scope.page - 1) * pageSize + 1;
  const lastRow = Math.min(scope.page * pageSize, total);

  /** Overwrite a set of params in one push (preserves everything else). Any
   * filter change resets to page 1 — staying on page 7 of a now-3-page result
   * would show an empty table. */
  function push(patch: Record<string, string | null>, resetPage = true) {
    // In a transition so the current results stay on screen and interactive
    // while the next page renders, instead of the whole view blocking.
    startNav(() => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage && !("page" in patch)) next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function switchTab(nextTab: "counters" | "visits") {
    if (nextTab === shownTab) return;
    // The optimistic write has to share the transition with the push, or React
    // commits the highlight and drops it again on the very next render.
    startNav(() => {
      showTab(nextTab);
      const next = new URLSearchParams(params.toString());
      next.set("tab", nextTab);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function goToPage(p: number) {
    push({ page: p <= 1 ? null : String(p) }, false);
  }

  function runExport() {
    setExportError(null);
    // Pass the CURRENT URL params through — the server action re-resolves the
    // same scope the page rendered, so the workbook matches the filters on screen
    // (minus pagination: export always covers every match).
    const payload = Object.fromEntries(params.entries());
    startExport(async () => {
      const res =
        scope.tab === "counters"
          ? await exportCountersXlsx(payload)
          : await exportVisitsXlsx(payload);
      if (!res.ok) {
        setExportError(res.error);
        return;
      }
      downloadXlsx(res.filename, res.base64);
    });
  }

  return (
    <div>
      {/* Tabs left, export right — the title now lives in the top bar, so
          these share the row the heading used to occupy. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
          {(["counters", "visits"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => switchTab(tk)}
              className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
              style={{
                background: shownTab === tk ? "var(--accent)" : "transparent",
                color: shownTab === tk ? "#fff" : "var(--ink-2)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {tk === "counters" ? t("Counters") : t("Visits")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAddCounter && <AddCounterButton />}
          <button
            type="button"
            className="btn btn-primary"
            onClick={runExport}
            disabled={exporting || total === 0}
          >
            {exporting ? t("Exporting…") : t("Export Excel")}
          </button>
        </div>
      </div>

      <div className="mb-3">
        <PeriodFilter
          period={scope.period.key}
          from={scope.period.from}
          to={scope.period.to}
          minDate={scope.period.minDate}
          maxDate={scope.period.maxDate}
          resetParams={["page"]}
        />
      </div>

      {/* Filter row */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
        <MapScopePickers levels={scope.levels} alsoClear={["isr"]} />
        {/* Visits only: a counter has no rep of its own to filter by. */}
        {scope.tab === "visits" && (
          <select
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            value={scope.filters.isrId ?? "all"}
            aria-label={t("ISR")}
            disabled={scope.isrOptions.length === 0}
            onChange={(e) => push({ isr: e.target.value === "all" ? null : e.target.value })}
          >
            <option value="all">{t("All ISRs")}</option>
            {scope.isrOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.isActive ? "" : ` (${t("deactivated")})`}
              </option>
            ))}
          </select>
        )}
        {/* Counters only: the visits tab is a log, and a log reads newest
            first or not at all. */}
        {scope.tab === "counters" && (
          <select
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            value={scope.sort}
            aria-label={t("Sort by")}
            onChange={(e) => push({ sort: e.target.value === "new" ? null : e.target.value })}
          >
            {COUNTER_SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {t(o.label)}
              </option>
            ))}
          </select>
        )}
        <SearchInput
          param="q"
          initial={scope.filters.q}
          resetParam="page"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12, minWidth: 200 }}
          placeholder={
            scope.tab === "counters"
              ? t("Search counter name or mobile…")
              : t("Search counter or rep name…")
          }
        />
        {/* The cumulative for everything the filters match — every page, not
            only the fifty rows below — so it answers "how much did this
            selection sell" without exporting first. */}
        {scope.tab === "visits" && (
          <div
            className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-lg px-3 py-1.5"
            style={{
              background: "var(--accent-tint)",
              // Stays in the filter row instead of dropping below it. A zero
              // basis with a floor means it only leaves the row when even the
              // floor will not fit; it then grows no wider than its content,
              // and the auto margin pushes it to the right end. When space is
              // short the SKU chips wrap under the total rather than the whole
              // box moving to a line of its own.
              flex: "1 1 0",
              minWidth: 180,
              maxWidth: "max-content",
            }}
            title={`${visitsTotal} ${t(visitsTotal === 1 ? "visit" : "visits")}`}
          >
            <span className="flex items-baseline gap-2">
              <span className="text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                {t("Cumulative sold")}
              </span>
              <span
                className="text-[16px] font-bold tabular-nums"
                style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
              >
                {visitsSold.toLocaleString("en-IN")}
              </span>
            </span>
            {/* Every SKU, in the table's order, zeros included: in a total, "sold
                none of these" is part of the answer, unlike in a single visit's
                cell where an untouched SKU is just noise. */}
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              {SEGMENT_ORDER.map((seg) => {
                const n = visitsSoldBySku[seg] ?? 0;
                return (
                  <span
                    key={seg}
                    className="rounded px-1.5 py-0.5 text-[11.5px] tabular-nums"
                    style={{ background: "var(--surface)", color: n > 0 ? "var(--ink-1)" : "var(--ink-3)" }}
                    title={`${PRODUCT_SEGMENTS.find((p) => p.value === seg)?.label ?? seg} — ${t("sold")} ${n.toLocaleString("en-IN")}`}
                  >
                    <strong style={{ color: n > 0 ? "var(--accent)" : "var(--ink-3)" }}>{seg}</strong>{" "}
                    {n.toLocaleString("en-IN")}
                  </span>
                );
              })}
            </span>
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

      {/* Dimmed while the next page is on its way, so a stale table reads as
          stale rather than as the answer to what was just clicked. */}
      <div className="transition-opacity" style={{ opacity: navigating ? 0.6 : 1 }}>
        {scope.tab === "counters" ? (
          <CountersTable rows={counters} t={t} />
        ) : (
          <VisitsTable rows={visits} t={t} />
        )}

        {totalPages > 1 && (
          <Pagination page={scope.page} totalPages={totalPages} onGo={goToPage} t={t} />
        )}
      </div>
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────

function CountersTable({ rows, t }: { rows: CounterReportRow[]; t: (k: string) => string }) {
  const router = useRouter();
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
              <tr
                key={r.id}
                onClick={() => router.push(`/khq/counter/${r.id}`)}
                // A <tr> takes no focus and answers no key, so the affordance
                // has to be spelled out: without these the counter would be
                // reachable with a mouse and by no other means.
                tabIndex={0}
                role="link"
                aria-label={`${r.name} — ${t("open counter")}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/khq/counter/${r.id}`);
                  }
                }}
                className="cursor-pointer"
                title={t("open counter")}
              >
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

