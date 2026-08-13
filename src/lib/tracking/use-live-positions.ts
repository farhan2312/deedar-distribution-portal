"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, RepPosition, ServerToClientEvents } from "./protocol";
import { issueWatcherTicket } from "./actions";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4001";

export type WatcherState = "connecting" | "live" | "error";

type TrackingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Subscribes to live positions for the reps this Sales Officer is authorized
 * to see. The set is resolved server-side from the ticket identity (as
 * Socket.IO room membership) — this client sends no ids and cannot widen its
 * own scope.
 */
export function useLivePositions(enabled = true) {
  const [positions, setPositions] = useState<Map<string, RepPosition>>(new Map());
  const [state, setState] = useState<WatcherState>("connecting");
  const socketRef = useRef<TrackingSocket | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    function teardown() {
      socketRef.current?.disconnect();
      socketRef.current = null;
    }

    if (!enabled) {
      teardown();
      return;
    }

    async function connect() {
      const res = await issueWatcherTicket();
      if (cancelledRef.current) return;
      if (!res.ok) {
        setState("error");
        return;
      }

      const socket: TrackingSocket = io(WS_URL, {
        auth: { ticket: res.ticket },
        reconnectionDelay: 2_000,
        reconnectionDelayMax: 30_000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelledRef.current) return;
        setState("live");
        // Re-subscribe on every (re)connect so a dropped socket rebuilds its
        // room membership and gets a fresh snapshot.
        socket.emit("subscribe");
      });

      socket.on("snapshot", ({ positions: list }) => {
        if (cancelledRef.current) return;
        setPositions(new Map(list.map((p) => [p.userId, p])));
      });

      socket.on("position", (position) => {
        if (cancelledRef.current) return;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(position.userId, position);
          return next;
        });
      });

      socket.on("disconnect", () => {
        if (cancelledRef.current) return;
        setState("connecting");
      });

      // Tickets expire quickly; refresh before the next retry.
      socket.on("connect_error", async () => {
        if (cancelledRef.current) return;
        setState("connecting");
        const fresh = await issueWatcherTicket();
        if (cancelledRef.current) return;
        if (fresh.ok) socket.auth = { ticket: fresh.ticket };
        else setState("error");
      });

      socket.on("trackingError", () => {
        if (cancelledRef.current) return;
        setState("error");
      });
    }

    void connect();
    return () => {
      cancelledRef.current = true;
      teardown();
    };
  }, [enabled]);

  return { positions, state };
}
