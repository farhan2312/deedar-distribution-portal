"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { counterStatusEnum } from "@/db/schema";
import { useT } from "@/lib/i18n/provider";

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
 * A browseable list of counters with search + area filter + optional depot
 * filter, and an optional per-row Check-in button.
 *
 * Same component powers `/field/counters` (ISR — showCheckIn=true, one depot)
 * and `/supervisor/counters` (SO — showCheckIn=false, many stockists). Filters
 * run client-side against the initial fetch so results are instant.
 */
export function CountersListClient({
  rows,
  areas,
  stockists,
  title,
  subtitle,
  truncated,
  maxRows,
  showCheckIn,
}: {
  rows: CounterListRow[];
  /** Areas the filter dropdown offers. Filter is hidden when there's ≤ 1. */
  areas: { id: string; name: string }[];
  /** Depots the filter dropdown offers. Filter is hidden when there's ≤ 1. */
  stockists: { id: string; name: string }[];
  title: string;
  subtitle: string;
  truncated: boolean;
  maxRows: number;
  showCheckIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [depot, setDepot] = useState("all");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (depot !== "all" && r.stockistId !== depot) return false;
      if (area !== "all" && r.areaId !== area) return false;
      if (needle) {
        const hay = `${r.name} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, area, depot]);

  // Areas shown in the dropdown depend on the depot filter — picking a depot
  // narrows the area list to that depot's areas. Otherwise the dropdown lists
  // every area across every depot the viewer can see, which for an SO
  // supervising 4 stockists would be a long unrelated list.
  const areaOptions = useMemo(() => {
    if (depot === "all") return areas;
    const idsInDepot = new Set(rows.filter((r) => r.stockistId === depot).map((r) => r.areaId));
    return areas.filter((a) => idsInDepot.has(a.id));
  }, [areas, depot, rows]);

  // Whether at least one visible row is in more than one depot — decides
  // whether the row subtitle should call out the depot name.
  const showDepotInRow = stockists.length > 1;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {title}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
        <input
          className="inp"
          style={{ padding: "6px 10px", fontSize: 12, minWidth: 200 }}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search by name or mobile…")}
        />
        {stockists.length > 1 && (
          <select
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            value={depot}
            onChange={(e) => {
              setDepot(e.target.value);
              // Picking a different depot invalidates any area filter that
              // belonged to the previous depot — reset it.
              setArea("all");
            }}
            aria-label={t("Stockist")}
          >
            <option value="all">{t("All stockists")}</option>
            {stockists.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {areaOptions.length > 1 && (
          <select
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            aria-label={t("Area")}
          >
            <option value="all">{t("All areas")}</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[12px]" style={{ color: "var(--ink-3)" }}>
          {visible.length} {t(visible.length === 1 ? "counter" : "counters")}
        </span>
      </div>

      {truncated && (
        <p className="mb-3 text-[12px]" style={{ color: "var(--warning)" }}>
          {t("Showing first")} {maxRows} {t("counters — refine the search to narrow down.")}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          {rows.length === 0
            ? t("No counters mapped to your stockist yet.")
            : t("No counters match — try clearing the filter.")}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
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
                    {showDepotInRow && <> · {c.stockistName}</>}
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
    </div>
  );
}
