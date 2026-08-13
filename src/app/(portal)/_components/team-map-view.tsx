import { LegendDot } from "@/components/ui/legend-dot";
import { LiveMapPanel } from "./live-map-panel";
import type { CounterPin, RepMeta } from "./live-map";

/**
 * The live-map screen shared by the Sales Officer (`/supervisor/map`) and C&F
 * HQ (`/hq/map`) views. Both show the same thing — a collapsible team roster,
 * a Leaflet counter map with live rep markers, and a status table — and differ
 * only in which reps are in scope and which pickers sit above it. Pages
 * compute the data; this owns the presentation so the two can't drift.
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

export function TeamMapView({
  scopeLabel,
  repRows,
  mapCounters,
  mapReps,
  controls,
  emptyMessage,
}: {
  /** Human label for the current scope, e.g. "all depots" or a depot name. */
  scopeLabel: string;
  repRows: TeamRepRow[];
  mapCounters: CounterPin[];
  mapReps: RepMeta[];
  /** Scope pickers (depot / C&F) rendered top-right. */
  controls?: React.ReactNode;
  /** Shown instead of the roster when nobody is in scope. */
  emptyMessage: string;
}) {
  return (
    <div>
      {controls && <div className="mb-3 flex flex-wrap justify-end gap-2">{controls}</div>}

      {repRows.length === 0 ? (
        <>
          <h4 className="mb-4 text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Team today — {scopeLabel}
          </h4>
          <p className="mb-6 text-[14px]" style={{ color: "var(--ink-3)" }}>{emptyMessage}</p>
        </>
      ) : (
        // Native <details> so this stays a server component — no client JS
        // needed just to collapse a list. Open by default.
        <details open className="group mb-6">
          <summary className="mb-4 flex cursor-pointer list-none items-center gap-2">
            <ChevronIcon className="h-4 w-4 flex-none transition-transform duration-200 group-open:rotate-90" />
            <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              Team today — {scopeLabel}
            </h4>
            <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent" }}>
              {repRows.length}
            </span>
            <span className="ml-auto text-[12px] font-semibold group-open:hidden" style={{ color: "var(--accent)" }}>
              Show
            </span>
            <span className="ml-auto hidden text-[12px] font-semibold group-open:inline" style={{ color: "var(--accent)" }}>
              Hide
            </span>
          </summary>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {repRows.map((r) => {
              const st = STATUS_STYLE[r.status];
              return (
                <div className="card p-4" key={r.id}>
                  <div className="flex items-center justify-between">
                    <div className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                      {r.name}
                    </div>
                    <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {r.area} · {r.visits} visits · {r.counters} counters
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-4">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {scopeLabel} — counter map
        </h4>
        <div className="flex flex-wrap items-center gap-3.5">
          <LegendDot color="var(--success)" label="Visited today" />
          <LegendDot color="var(--ink-3)" label="Pending" />
          <LegendDot color="var(--danger)" label="Declining" />
          <LegendDot color="#2E5FA3" label="Rep (live)" />
        </div>
      </div>

      <LiveMapPanel counters={mapCounters} reps={mapReps} />

      {/* Live team table */}
      <h6 className="mt-7 mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Live team — status for the day
      </h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Last seen", "Counter hrs"].map((h) => (
                <th key={h}>{h}</th>
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
                        {st.label}
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
