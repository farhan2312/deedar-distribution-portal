"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { counterStatusEnum } from "@/db/schema";
import { useT } from "@/lib/i18n/provider";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";

type CounterStatus = (typeof counterStatusEnum.enumValues)[number];

export type CounterListRow = {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  areaId: string;
  areaName: string;
  stockistId: string;
  stockistName: string;
  status: CounterStatus;
  /** Depot rule: only same-depot counters can be visited. Ignored entirely
   * when the viewer doesn't get a Check-in button (Sales Officer view). */
  canVisit: boolean;
  /** This rep has already visited it today. Only meaningful for the ISR
   * view — server sets it to false for everyone else. */
  visitedToday: boolean;
};

const STATUS_STYLE: Record<CounterStatus, { label: string; bg: string; color: string }> = {
  active: { label: "Active", bg: "rgba(30,158,90,.12)", color: "var(--success)" },
  dormant: { label: "Dormant", bg: "rgba(178,94,0,.12)", color: "var(--warning)" },
  declining: { label: "Declining", bg: "rgba(199,38,59,.12)", color: "var(--danger)" },
};

/**
 * A browseable list of counters with search + area filter + optional stockist
 * filter, and an optional per-row Check-in button.
 *
 * Same component powers `/field/counters` (ISR — showCheckIn=true, one
 * stockist) and `/supervisor/counters` (SO — showCheckIn=false, many).
 *
 * Every filter is a query param and every page is a fresh query, so `rows` is
 * the current page and nothing else. The browser used to hold the whole
 * territory and filter it in memory, which meant the page cost grew with the
 * stockist and anything past the fetch cap was invisible.
 */
export function CountersListClient({
  rows,
  areaOptions,
  stockistOptions,
  filters,
  total,
  page,
  totalPages,
  pageSize,
  scope,
  showCheckIn,
}: {
  /** The current page's rows — not the whole list. */
  rows: CounterListRow[];
  areaOptions: { id: string; name: string }[];
  stockistOptions: { id: string; name: string }[];
  /** What the server applied, so the controls show their real state. */
  filters: { q: string; areaId: string | null; stockistId: string | null };
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  /** Which stockist(s) the rows cover — the page title is in the top bar. */
  scope: string;
  showCheckIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The dropdowns light up on click and defer to the server's answer on
  // settle, so choosing a filter never appears to snap back.
  const [shown, showOptimistic] = useOptimistic({
    areaId: filters.areaId,
    stockistId: filters.stockistId,
  });

  /** Any filter change resets to page 1 — page 7 of a now-3-page result is an
   * empty table. */
  function push(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function selectStockist(next: string) {
    startTransition(() => {
      // The area filter belonged to the previous stockist, so it goes with it.
      showOptimistic({ stockistId: next === "all" ? null : next, areaId: null });
      push({ depot: next, area: null });
    });
  }

  function selectArea(next: string) {
    startTransition(() => {
      showOptimistic({ ...shown, areaId: next === "all" ? null : next });
      push({ area: next });
    });
  }

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const filtered = !!(filters.q || filters.areaId || filters.stockistId);

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Title and description are in the top bar; this names the scope. */}
      <div className="mb-3">
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {scope}
        </span>
      </div>

      {/* Filters */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
        <SearchInput
          param="q"
          initial={filters.q}
          resetParam="page"
          style={{ padding: "6px 10px", fontSize: 12, minWidth: 200 }}
          placeholder={t("Search by name or mobile…")}
        />
        {stockistOptions.length > 1 && (
          <select
            className="inp transition-opacity"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12, opacity: pending ? 0.72 : 1 }}
            value={shown.stockistId ?? "all"}
            onChange={(e) => selectStockist(e.target.value)}
            aria-label={t("Stockist")}
          >
            <option value="all">{t("All stockists")}</option>
            {stockistOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {areaOptions.length > 1 && (
          <select
            className="inp transition-opacity"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12, opacity: pending ? 0.72 : 1 }}
            value={shown.areaId ?? "all"}
            onChange={(e) => selectArea(e.target.value)}
            aria-label={t("Area")}
          >
            <option value="all">{t("All areas")}</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[12px]" style={{ color: "var(--ink-3)" }}>
          {total > pageSize && (
            <>
              {firstRow}–{lastRow} {t("of")}{" "}
            </>
          )}
          {total} {t(total === 1 ? "counter" : "counters")}
        </span>
      </div>

      {/* Dimmed while the next page is in flight, so a stale list doesn't read
          as the answer to what was just clicked. */}
      <div className="transition-opacity" style={{ opacity: pending ? 0.6 : 1 }}>
        {total === 0 ? (
          <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
            {filtered
              ? t("No counters match — try clearing the filter.")
              : t("No counters mapped to your stockist yet.")}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => {
              const st = STATUS_STYLE[c.status];
              return (
                <div key={c.id} className="card card-hover flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>
                        {c.name}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {t(st.label)}
                      </span>
                      {c.visitedToday && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={{ background: "rgba(30,158,90,.12)", color: "var(--success)" }}
                        >
                          {t("Visited today")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {t(c.type)} · {c.areaName}
                      {stockistOptions.length > 1 && <> · {c.stockistName}</>}
                      {c.phone && <> · <span className="tabular-nums">{c.phone}</span></>}
                    </div>
                  </div>
                  {showCheckIn && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push(`/field/counter/${c.id}`)}
                      disabled={!c.canVisit}
                      title={c.canVisit ? undefined : t("This counter is at another stockist.")}
                    >
                      {c.visitedToday ? t("Open") : t("Check in")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onGo={(p) => startTransition(() => push({ page: p <= 1 ? null : String(p) }, true))}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
