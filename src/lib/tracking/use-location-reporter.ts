"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  distanceMeters,
  HEARTBEAT_MS,
  MAX_ACCURACY_METERS,
  MIN_MOVE_METERS,
  type ClientToServerEvents,
  type LocationReport,
  type ServerToClientEvents,
} from "./protocol";
import { issueRepTicket } from "./actions";
import { getDeviceId } from "./device-id";

export type ReporterState = "off" | "connecting" | "live" | "denied" | "error" | "blocked";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4001";

type TrackingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Streams this rep's position to the realtime service while `enabled`.
 *
 * Reporting is event-driven — the browser wakes us on a real GPS fix via
 * `watchPosition`; there is no polling loop. A fix is only sent when the rep
 * has actually moved a meaningful distance, plus a slow heartbeat so the
 * server can distinguish "parked" from "device gone".
 *
 * Socket.IO owns reconnection (exponential backoff + jitter) and transport
 * fallback, which matters on mobile networks that drop between cell towers.
 */
export function useLocationReporter(enabled: boolean) {
  const [state, setState] = useState<ReporterState>("connecting");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const socketRef = useRef<TrackingSocket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFixRef = useRef<LocationReport | null>(null);
  const cancelledRef = useRef(false);

  const push = useCallback((fix: LocationReport) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("location", fix, (res) => {
      if (!res.ok) return;
      lastSentRef.current = { lat: fix.lat, lng: fix.lng, at: res.at };
      setLastSentAt(res.at);
    });
  }, []);

  /** Send only on meaningful movement; the heartbeat covers standing still. */
  const considerFix = useCallback(
    (fix: LocationReport) => {
      latestFixRef.current = fix;
      const prev = lastSentRef.current;
      if (!prev) {
        push(fix);
        return;
      }
      if (distanceMeters(prev.lat, prev.lng, fix.lat, fix.lng) >= MIN_MOVE_METERS) push(fix);
    },
    [push],
  );

  useEffect(() => {
    cancelledRef.current = false;

    function stopWatching() {
      if (watchIdRef.current != null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    function teardown() {
      stopWatching();
      socketRef.current?.disconnect();
      socketRef.current = null;
      lastSentRef.current = null;
      latestFixRef.current = null;
    }

    if (!enabled) {
      teardown();
      return;
    }

    async function connect() {
      // Ticket first: every setState below then happens after an await, i.e.
      // never synchronously inside the effect body.
      const res = await issueRepTicket(getDeviceId());
      if (cancelledRef.current) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setState("error");
        return;
      }
      if (!res.ok) {
        // Another device owns today's tracking — don't open a socket at all,
        // so this login never becomes a second pin on the SO/C&F map.
        setState(res.code === "other_device" ? "blocked" : "error");
        return;
      }
      setState("connecting");

      const socket: TrackingSocket = io(WS_URL, {
        auth: { ticket: res.ticket },
        // Backoff between attempts; Socket.IO adds jitter so a tower outage
        // doesn't stampede every rep back at the same instant.
        reconnectionDelay: 2_000,
        reconnectionDelayMax: 30_000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelledRef.current) return;
        setState("live");

        // Start watching only once we have somewhere to send fixes to.
        if (watchIdRef.current == null) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) =>
              considerFix({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
                recordedAt: pos.timestamp,
              }),
            (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
            { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
          );
        }

        // Heartbeat: re-send the last known fix if we've gone quiet, so the
        // server can tell a stationary rep from a disconnected device.
        if (!heartbeatRef.current) {
          heartbeatRef.current = setInterval(() => {
            const fix = latestFixRef.current;
            if (!fix) return;
            if (Date.now() - (lastSentRef.current?.at ?? 0) >= HEARTBEAT_MS) push(fix);
          }, HEARTBEAT_MS);
        }
      });

      socket.on("disconnect", () => {
        if (cancelledRef.current) return;
        setState("connecting"); // Socket.IO retries on its own
      });

      // The ticket is short-lived, so a reconnect after a long outage can fail
      // auth. Mint a fresh one and hand it to the next attempt.
      socket.on("connect_error", async () => {
        if (cancelledRef.current) return;
        setState("connecting");
        const fresh = await issueRepTicket(getDeviceId());
        if (cancelledRef.current) return;
        if (fresh.ok) {
          socket.auth = { ticket: fresh.ticket };
        } else if (fresh.code === "other_device") {
          // Ownership moved to another device mid-session — stop retrying here.
          stopWatching();
          socket.disconnect();
          setState("blocked");
        } else {
          setState("error");
        }
      });

      socket.on("trackingError", () => {
        if (cancelledRef.current) return;
        stopWatching();
        setState("error");
      });
    }

    void connect();
    return () => {
      cancelledRef.current = true;
      teardown();
    };
  }, [enabled, considerFix, push]);

  // Derived rather than stored, so disabling never needs a setState in the effect.
  return { state: enabled ? state : "off", lastSentAt, maxAccuracyM: MAX_ACCURACY_METERS };
}
