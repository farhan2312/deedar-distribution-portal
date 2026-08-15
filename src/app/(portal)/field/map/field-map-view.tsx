"use client";

import { useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { distanceMeters, type RepPosition } from "@/lib/tracking/protocol";
import { distanceLabel, useOwnPosition } from "@/lib/tracking/use-own-position";
import { COUNTER_COLORS, REP_LIVE_COLOR } from "../../_components/map-colors";
import type { CounterPin } from "../../_components/live-map";
import { LegendDot } from "@/components/ui/legend-dot";

// Leaflet touches `window` at import time, so it can't be server-rendered.
const LiveMap = dynamic(() => import("../../_components/live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-2xl border"
      style={{ aspectRatio: "21 / 9", minHeight: 380, background: "var(--bg-soft)", borderColor: "var(--hairline-soft)" }}
    />
  ),
});

/** Synthetic id for the rep's own marker — the map component is built around
 * watching OTHER reps, so we feed it a single "me" entry rather than forking it. */
const ME = "me";

const STATE_NOTE: Record<string, string> = {
  locating: "Finding your location…",
  denied: "Location blocked — allow access to see how far each counter is.",
  unavailable: "Location unavailable on this device.",
};

export function FieldMapView({ counters }: { counters: CounterPin[] }) {
  const { position, state } = useOwnPosition();

  // The map already knows how to draw rep markers from a positions map, so
  // reuse it wholesale instead of writing a second Leaflet integration.
  const positions = useMemo(() => {
    const m = new Map<string, RepPosition>();
    if (position) {
      m.set(ME, {
        userId: ME,
        lat: position.lat,
        lng: position.lng,
        accuracyM: position.accuracyM,
        // Stamped when the fix arrived. If the device goes quiet for a while
        // the marker greys out as stale, which is the honest signal here.
        updatedAt: position.updatedAt,
      });
    }
    return m;
  }, [position]);

  /** Nearest-first once located; otherwise unvisited before visited, so the
   * work still to do is at the top. */
  const ordered = useMemo(() => {
    const withDistance = counters.map((c) => ({
      counter: c,
      metres: position ? distanceMeters(position.lat, position.lng, c.lat, c.lng) : null,
    }));
    return withDistance.sort((a, b) => {
      if (a.metres != null && b.metres != null) return a.metres - b.metres;
      if (Number(a.counter.visited) !== Number(b.counter.visited)) {
        return Number(a.counter.visited) - Number(b.counter.visited);
      }
      return a.counter.name.localeCompare(b.counter.name);
    });
  }, [counters, position]);

  const note = STATE_NOTE[state];

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3.5">
          <LegendDot color={COUNTER_COLORS.visited} label="Visited today" />
          <LegendDot color={COUNTER_COLORS.pending} label="Pending" />
          <LegendDot color={REP_LIVE_COLOR} label="You" />
        </div>
        {note && (
          <span className="text-[12px]" style={{ color: state === "denied" ? "var(--danger)" : "var(--ink-3)" }}>
            {note}
          </span>
        )}
      </div>

      {/*
        Same shape as the Sales Officer map: narrow scrolling list beside the
        map. On `lg` the list is absolutely positioned inside its grid cell so
        it contributes no height of its own — the row is sized by the map and
        the list scrolls internally instead of stretching the page.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <div className="relative h-[320px] lg:h-auto">
          <div className="card absolute inset-0 flex flex-col overflow-hidden p-0">
            <div
              className="flex flex-none items-center gap-2 border-b px-3.5 py-3"
              style={{ borderColor: "var(--hairline-soft)" }}
            >
              <h4 className="text-[13.5px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                Today&apos;s counters
              </h4>
              <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent" }}>
                {counters.length}
              </span>
            </div>

            {counters.length === 0 ? (
              <p className="px-3.5 py-4 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                No counters on your beat today — your Sales Officer assigns these.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {ordered.map(({ counter: c, metres }) => (
                  <li key={c.id} className="border-b last:border-b-0" style={{ borderColor: "var(--hairline-soft)" }}>
                    <Link href={`/field/counter/${c.id}`} className="block px-3.5 py-2.5 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ background: c.visited ? COUNTER_COLORS.visited : COUNTER_COLORS.pending }}
                        />
                        <span className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-1)" }} title={c.name}>
                          {c.name}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {c.type} · {c.area}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={
                            c.visited
                              ? { background: "rgba(30,158,90,.12)", color: "var(--success)" }
                              : { background: "var(--bg-soft)", color: "var(--ink-2)" }
                          }
                        >
                          {c.visited ? "Visited" : "Pending"}
                        </span>
                        <span className="flex-none text-[11.5px] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                          {metres != null ? distanceLabel(metres) : "—"}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <LiveMap counters={counters} reps={[{ id: ME, name: "You" }]} positions={positions} />
          <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            Distances are straight-line from your current location, not road distance.
          </p>
        </div>
      </div>
    </div>
  );
}
