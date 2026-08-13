"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLivePositions } from "@/lib/tracking/use-live-positions";
import { STALE_AFTER_MS } from "@/lib/tracking/protocol";
import type { CounterPin, RepMeta } from "./live-map";

export type { CounterPin, RepMeta };

// Leaflet touches `window` at import time, so it can't be server-rendered.
const LiveMap = dynamic(() => import("./live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-2xl border"
      style={{ aspectRatio: "21 / 9", minHeight: 380, background: "var(--bg-soft)", borderColor: "var(--hairline-soft)" }}
    />
  ),
});

const STATE_STYLE = {
  live: { label: "Live", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  connecting: { label: "Connecting…", bg: "rgba(224,177,92,.2)", color: "#B25E00" },
  error: { label: "Offline", bg: "rgba(199,38,59,.1)", color: "#C7263B" },
} as const;

export function LiveMapPanel({ counters, reps }: { counters: CounterPin[]; reps: RepMeta[] }) {
  const { positions, state } = useLivePositions();
  const st = STATE_STYLE[state];

  // Staleness decays with wall-clock time, which can't be read during render
  // (impure). Tick a timestamp from timer callbacks and derive from that.
  const [nowTick, setNowTick] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNowTick(Date.now()), 0);
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const activeCount = useMemo(() => {
    // Before the first tick, anything we've received is by definition fresh.
    if (nowTick == null) return positions.size;
    return [...positions.values()].filter((p) => nowTick - p.updatedAt <= STALE_AFTER_MS).length;
  }, [positions, nowTick]);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-3">
        <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
          {st.label}
        </span>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          {activeCount} of {reps.length} rep{reps.length === 1 ? "" : "s"} reporting now
        </span>
      </div>

      <LiveMap counters={counters} reps={reps} positions={positions} />

      <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        Rep markers update in realtime over WebSocket while they&apos;re clocked in.
        Markers grey out after {Math.round(STALE_AFTER_MS / 60_000)} minutes without an update.
      </p>
    </div>
  );
}
