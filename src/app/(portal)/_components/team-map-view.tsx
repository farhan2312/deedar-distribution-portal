import { LegendDot } from "@/components/ui/legend-dot";
import { getT } from "@/lib/i18n/server";
import { pickupBarColor, soldAgainstPickup } from "@/lib/field/day-stock";
import { COUNTER_COLORS, REP_LIVE_COLOR } from "./map-colors";
import { TeamLive } from "./team-live";
import { STATUS_STYLE, repStatus, type RepStatus, type TeamRepRow } from "./team-status";
import type { CounterPin, RepMeta } from "./live-map";

/**
 * The live-map screen shared by the Sales Officer (`/supervisor/map`) and C&F
 * HQ (`/hq/map`) views. Both show the same thing — a narrow scrolling team
 * roster beside a Leaflet counter map with live rep markers, plus a status
 * table — and differ only in which reps are in scope and which pickers sit
 * above it. Pages compute the data; this owns the presentation so the two
 * can't drift.
 */
// Re-exported so both map pages can keep importing everything they need for a
// roster row from one place.
export { STATUS_STYLE, repStatus, type RepStatus, type TeamRepRow };

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
      <TeamLive
        repRows={repRows}
        mapCounters={mapCounters}
        mapReps={mapReps}
        emptyMessage={emptyMessage}
      />

      {/* Live team table */}
      <h6 className="mt-7 mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Live team — status for the day")}
      </h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Sold / Pickup", "Last seen", "Counter hrs"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-3)" }}>{emptyMessage}</td>
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
                    {/* Sold against what they carried out this morning. The
                        percentage is graded by the same ramp the leaderboards
                        use, so "good" looks the same wherever it appears. A rep
                        who has not started has no target to measure against —
                        that is a different thing from 0%. */}
                    <td className="whitespace-nowrap tabular-nums">
                      {r.started ? <SoldAgainst sold={r.sold} pickup={r.pickup} /> : "—"}
                    </td>
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

/** "84 / 120 · 70%", the percentage coloured by how the day is going. */
function SoldAgainst({ sold, pickup }: { sold: number; pickup: number }) {
  const pct = soldAgainstPickup(sold, pickup);
  return (
    <>
      <b style={{ color: "var(--ink-1)" }}>{sold}</b>
      <span style={{ color: "var(--ink-3)" }}> / {pickup}</span>
      {pct != null && (
        <span className="ml-1.5 font-semibold" style={{ color: pickupBarColor(pct) }}>
          {pct}%
        </span>
      )}
    </>
  );
}

