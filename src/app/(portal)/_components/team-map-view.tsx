import { LegendDot } from "@/components/ui/legend-dot";
import { getT } from "@/lib/i18n/server";
import { LiveMapPanel } from "./live-map-panel";
import { COUNTER_COLORS, REP_LIVE_COLOR } from "./map-colors";
import type { CounterPin, RepMeta } from "./live-map";

/**
 * The live-map screen shared by the Sales Officer (`/supervisor/map`) and C&F
 * HQ (`/hq/map`) views. Both show the same thing — a narrow scrolling team
 * roster beside a Leaflet counter map with live rep markers, plus a status
 * table — and differ only in which reps are in scope and which pickers sit
 * above it. Pages compute the data; this owns the presentation so the two
 * can't drift.
 */
export type RepStatus = "done" | "active" | "idle" | "off";

export const STATUS_STYLE: Record<RepStatus, { label: string; bg: string; color: string }> = {
  done: { label: "Day closed", bg: "rgba(140,180,201,.2)", color: "#3E6B85" },
  active: { label: "On counter", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  idle: { label: "Idle", bg: "rgba(224,177,92,.2)", color: "#B25E00" },
  off: { label: "Not started", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

export function repStatus(
  startAt: Date | null,
  endAt: Date | null,
  visitedToday: boolean,
): RepStatus {
  if (endAt) return "done";
  if (!startAt) return "off";
  return visitedToday ? "active" : "idle";
}

export type TeamRepRow = {
  id: string;
  name: string;
  status: RepStatus;
  /** Where they were last seen — area of their most recent visit, or depot. */
  area: string;
  visits: number;
  counters: number;
  lastLabel: string;
  onJob: string;
  started: boolean;
};

export async function TeamMapView({
  scopeLabel,
  repRows,
  mapCounters,
  mapReps,
  controls,
  emptyMessage,
}: {
  /** Human label for the current scope, e.g. "all stockists" or a depot name. */
  scopeLabel: string;
  repRows: TeamRepRow[];
  mapCounters: CounterPin[];
  mapReps: RepMeta[];
  /** Scope pickers (depot / C&F) rendered top-right. */
  controls?: React.ReactNode;
  /** Shown instead of the roster when nobody is in scope. */
  emptyMessage: string;
}) {
  const t = await getT();

  return (
    <div>
      {controls && <div className="mb-3 flex flex-wrap justify-end gap-2">{controls}</div>}

      <div className="mb-2.5 flex flex-wrap items-center gap-4">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {scopeLabel} — {t("counter map")}
        </h4>
        <div className="flex flex-wrap items-center gap-3.5">
          <LegendDot color={COUNTER_COLORS.visited} label={t("Visited today")} />
          <LegendDot color={COUNTER_COLORS.pending} label={t("Pending")} />
          <LegendDot color={COUNTER_COLORS.counter} label={t("Counters")} />
          <LegendDot color={REP_LIVE_COLOR} label={t("Rep (live)")} />
        </div>
      </div>

      {/*
        Roster left, map right. The roster column is deliberately narrow and
        capped so the map keeps the bulk of the width. On `lg` the roster card
        is absolutely positioned inside its grid cell: it therefore contributes
        NO height of its own, so the row is sized purely by the map and the
        list scrolls internally instead of stretching the layout.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,240px)_1fr]">
        <div className="relative h-[300px] lg:h-auto">
          <div className="card absolute inset-0 flex flex-col overflow-hidden p-0">
            <div
              className="flex flex-none items-center gap-2 border-b px-3.5 py-3"
              style={{ borderColor: "var(--hairline-soft)" }}
            >
              <h4 className="text-[13.5px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                {t("Team today")}
              </h4>
              <span
                className="chip"
                style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent" }}
              >
                {repRows.length}
              </span>
            </div>

            {repRows.length === 0 ? (
              <p className="px-3.5 py-4 text-[12.5px]" style={{ color: "var(--ink-3)" }}>{emptyMessage}</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {repRows.map((r) => {
                  const st = STATUS_STYLE[r.status];
                  return (
                    <li
                      key={r.id}
                      className="border-b px-3.5 py-2.5 last:border-b-0"
                      style={{ borderColor: "var(--hairline-soft)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 flex-none rounded-full" style={{ background: st.color }} />
                        <span
                          className="truncate text-[13px] font-semibold"
                          style={{ color: "var(--ink-1)" }}
                          title={r.name}
                        >
                          {r.name}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }} title={r.area}>
                        {r.area}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {t(st.label)}
                        </span>
                        {/* Spelled out — a bare "0/0" doesn't say what it counts. */}
                        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                          {r.visits} {t("visits")} · {r.counters} {t("Counters").toLowerCase()}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <LiveMapPanel counters={mapCounters} reps={mapReps} />
        </div>
      </div>

      {/* Live team table */}
      <h6 className="mt-7 mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Live team — status for the day")}
      </h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Last seen", "Counter hrs"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-3)" }}>{emptyMessage}</td>
              </tr>
            ) : (
              repRows.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.name}</td>
                    <td>
                      <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                        {t(st.label)}
                      </span>
                    </td>
                    <td>{r.visits}</td>
                    <td>{r.lastLabel}</td>
                    <td>{r.started ? r.onJob : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

