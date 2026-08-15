"use client";

import { useEffect, useState } from "react";
import { MAX_ACCURACY_METERS } from "./protocol";

/**
 * The CURRENT DEVICE's own GPS position, for showing the rep where they are
 * relative to their counters.
 *
 * Deliberately separate from `useLocationReporter`: that one exists to PUSH the
 * rep's position to the server over a socket (and only while they're clocked
 * in). This one only READS the device locally — no ticket, no socket, no
 * server round-trip — so the map works even before the day is started.
 */
export type OwnPosition = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** When this fix arrived (ms epoch). Stamped in the geolocation callback
   * rather than during render — reading the clock while rendering is impure
   * and React 19's lint rejects it. */
  updatedAt: number;
};
export type OwnPositionState = "locating" | "live" | "denied" | "unavailable";

export function useOwnPosition(enabled = true) {
  const [position, setPosition] = useState<OwnPosition | null>(null);
  const [state, setState] = useState<OwnPositionState>("locating");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let watchId: number | null = null;

    // Every setState below happens after an await, never synchronously in the
    // effect body — React 19's lint rejects the latter.
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setState("unavailable");
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          // Drop wildly imprecise fixes (usually IP/wifi guesses) — a distance
          // computed from those would be misleading rather than merely rough.
          const accuracy = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null;
          if (accuracy != null && accuracy > MAX_ACCURACY_METERS) return;
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: accuracy,
            updatedAt: Date.now(),
          });
          setState("live");
        },
        (err) => {
          if (cancelled) return;
          setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
      );
    })();

    return () => {
      cancelled = true;
      if (watchId != null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enabled]);

  return { position, state };
}

/** "120 m" / "1.4 km" — distance as a field rep would read it. */
export function distanceLabel(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}
