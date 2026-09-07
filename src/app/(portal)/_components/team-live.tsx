"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { LiveMapPanel } from "./live-map-panel";
import type { CounterPin, RepMeta } from "./live-map";
import { STATUS_STYLE, type TeamRepRow } from "./team-status";

/**
 * The roster beside the map, and the map itself.
 *
 * They live in one client component because clicking a name has to move the
 * map — state neither could hold alone while the roster was server-rendered.
 * Everything else about this screen stays on the server.
 */
export function TeamLive({
  repRows,
  mapCounters,
  mapReps,
  emptyMessage,
}: {
  repRows: TeamRepRow[];
  mapCounters: CounterPin[];
  mapReps: RepMeta[];
  emptyMessage: string;
}) {
  const t = useT();
  // The timestamp is what makes clicking the same name twice work — see
  // `focus` on LiveMap.
  const [focus, setFocus] = useState<{
    kind: "rep";
    id: string;
    at: number;
    point?: { lat: number; lng: number } | null;
  } | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,240px)_1fr]">
      <div className="relative h-[300px] lg:h-auto">
        <div className="card absolute inset-0 flex flex-col overflow-hidden p-0">
          <div
            className="flex flex-none items-center gap-2 border-b px-3.5 py-3"
            style={{ borderColor: "var(--hairline-soft)" }}
          >
            <h4
              className="text-[13.5px] font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
            >
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
            <p className="px-3.5 py-4 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {emptyMessage}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {repRows.map((r) => {
                const st = STATUS_STYLE[r.status];
                const looking = focus?.id === r.id;
                // A rep who is not reporting has no marker; their last visit is
                // the closest honest answer to "where is he right now".
                const point =
                  r.lastLat != null && r.lastLng != null
                    ? { lat: r.lastLat, lng: r.lastLng }
                    : null;
                return (
                  <li
                    key={r.id}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--hairline-soft)" }}
                  >
                    <button
                      type="button"
                      className="w-full cursor-pointer px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-soft)]"
                      style={looking ? { background: "var(--accent-tint)" } : undefined}
                      onClick={() => setFocus({ kind: "rep", id: r.id, at: Date.now(), point })}
                      aria-pressed={looking}
                      title={t("Show on map")}
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <LiveMapPanel counters={mapCounters} reps={mapReps} focus={focus} />
      </div>
    </div>
  );
}
