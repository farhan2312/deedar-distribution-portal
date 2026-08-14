"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { distanceMeters, STALE_AFTER_MS, type RepPosition } from "@/lib/tracking/protocol";
import { COUNTER_COLORS } from "./map-colors";

export type CounterPin = {
  id: string;
  name: string;
  /** Counter type, e.g. "Tea Stall". */
  type: string;
  area: string;
  lat: number;
  lng: number;
  /** A rep visited it today → green. */
  visited: boolean;
  /** On a rep's beat for today but not visited yet → grey ("pending"). */
  assigned: boolean;
  /** Stock seen at the most recent visit. */
  stock: number;
  /** Formatted date of the last visit, or null if never visited. */
  lastVisitLabel: string | null;
};

export type RepMeta = { id: string; name: string };

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Fallback view when nothing is mapped yet (roughly central India). */
const FALLBACK_CENTER: [number, number] = [25.72, 76.11];

/** Popup content is an HTML string, so anything from the DB must be escaped. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function counterColor(p: CounterPin): string {
  if (p.visited) return COUNTER_COLORS.visited;
  if (p.assigned) return COUNTER_COLORS.pending;
  return COUNTER_COLORS.counter;
}

/** Human label for the pin's current state. */
function counterStatusLabel(c: CounterPin): string {
  if (c.visited) return "Visited today";
  if (c.assigned) return "Pending — assigned today";
  return "Counter";
}

/** Counter detail card shown when a pin is clicked. A thin left-edge bar in the
 * pin's status colour ties the card back to the dot. */
function counterPopup(c: CounterPin): string {
  const color = counterColor(c);
  const meta = [c.type, c.area].filter(Boolean).map(esc).join(" · ");
  const facts = [`Stock: ${c.stock}`, c.lastVisitLabel ? `Last visit: ${esc(c.lastVisitLabel)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    `<div style="min-width:150px;border-left:3px solid ${color};padding-left:10px;font-family:var(--font-sans)">` +
    `<div style="font:700 13.5px/1.3 inherit;color:#221f3a">${esc(c.name)}</div>` +
    `<div style="font-size:11.5px;color:#8a88a3;margin-top:2px">${meta}</div>` +
    `<div style="font-size:11.5px;color:#5d5b76;margin-top:3px">${facts}</div>` +
    `<div style="font-size:11.5px;font-weight:600;color:${color};margin-top:4px">${counterStatusLabel(c)}</div>` +
    `</div>`
  );
}

function dotIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function repIcon(name: string, stale: boolean): L.DivIcon {
  const color = stale ? "#8A8F98" : "#2E5FA3";
  const initial = name.charAt(0).toUpperCase();
  return L.divIcon({
    className: "",
    html:
      `<span style="display:flex;align-items:center;gap:5px">` +
      `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;` +
      `background:${color};color:#fff;font:700 12px/1 system-ui;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${initial}</span>` +
      `<span style="white-space:nowrap;background:rgba(255,255,255,.9);color:${color};font:700 12px/1 system-ui;` +
      `padding:3px 7px;border-radius:999px">${name}${stale ? " · stale" : ""}</span>` +
      `</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// ── Live-marker interpolation ───────────────────────────────────────────
// Fixes arrive sparsely by design (the rep sends on ~50 m of movement plus a
// 60 s heartbeat), so a raw setLatLng per fix makes markers teleport. We tween
// between fixes on the client instead — purely cosmetic, the rep-side policy,
// the socket and the stored position are all untouched.
//
// The tween drives `marker.setLatLng()` rather than a CSS transform/transition
// on the icon: Leaflet owns those transforms for its own pan/zoom, so animating
// them directly makes markers drift away from their coordinates while the user
// drags the map. Re-setting the latlng each frame lets Leaflet re-project, so
// the marker stays pinned to real ground even mid-pan.

/** Below this a fix is the same place — GPS jitter or the heartbeat re-sending
 * the last fix. Snap silently so a parked rep never visibly drifts. */
const STATIONARY_M = 5;
/** Past this, gliding would invent a path the rep never took — snap instead. */
const SNAP_DISTANCE_M = 1500;
/** Same idea on the time axis: after a silence this long (lost signal, or a
 * suspended tab) the route in between is unknown, so don't animate it. */
const SNAP_GAP_MS = 3 * 60_000;
/** ~1 s for the sender's 50 m movement threshold — the common case. */
const MS_PER_METER = 20;
const MIN_DURATION_MS = 250;
/** Hard ceiling: a marker must always settle, and should land before the next
 * fix is due rather than lagging permanently behind the rep. */
const MAX_DURATION_MS = 2500;

type RepMarker = {
  marker: L.Marker;
  /** In-flight rAF handle, or null once the marker has settled. */
  frame: number | null;
  /** The fix the marker is heading to (or resting on). */
  target: { lat: number; lng: number };
  /** `updatedAt` of that fix — gap detection at the source. */
  targetAt: number;
  /** When we last applied a fix locally — gap detection at our end, which is
   * what catches a browser that was suspended and resumed. */
  renderedAt: number;
  /** Whether the icon is currently drawn in its stale styling. */
  stale: boolean;
};

/**
 * Tween `entry.marker` to `to` over `duration`, linearly.
 *
 * Starts from the marker's *live* position (`getLatLng()`), not the previous
 * fix, so superseding an in-flight tween never snaps the marker backwards.
 */
function animateMarker(entry: RepMarker, to: { lat: number; lng: number }, duration: number) {
  const from = entry.marker.getLatLng();
  const start = performance.now();

  const step = (frameTime: number) => {
    // rAF timestamps share performance.now()'s clock.
    const t = Math.min(1, (frameTime - start) / duration);
    entry.marker.setLatLng([
      from.lat + (to.lat - from.lat) * t,
      from.lng + (to.lng - from.lng) * t,
    ]);
    entry.frame = t < 1 ? requestAnimationFrame(step) : null;
  };

  entry.frame = requestAnimationFrame(step);
}

/**
 * Leaflet map: every geo-tagged counter plus live rep markers that move as
 * WebSocket updates arrive. Imperative Leaflet (not react-leaflet) so marker
 * updates mutate in place instead of re-rendering the whole layer tree.
 */
export function LiveMap({
  counters,
  reps,
  positions,
}: {
  counters: CounterPin[];
  reps: RepMeta[];
  positions: Map<string, RepPosition>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const repLayerRef = useRef<Map<string, RepMarker>>(new Map());
  const fittedRef = useRef(false);

  const repNames = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);

  // Create the map + static counter pins once.
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, { center: FALLBACK_CENTER, zoom: 12, scrollWheelZoom: true });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    for (const c of counters) {
      L.marker([c.lat, c.lng], { icon: dotIcon(counterColor(c), 14) })
        .addTo(map)
        .bindPopup(counterPopup(c));
    }

    if (counters.length > 0) {
      map.fitBounds(L.latLngBounds(counters.map((c) => [c.lat, c.lng] as [number, number])).pad(0.2));
      fittedRef.current = true;
    }

    const repLayer = repLayerRef.current;
    return () => {
      // Stop every tween before the map goes away, so no frame fires against a
      // removed marker.
      for (const entry of repLayer.values()) {
        if (entry.frame !== null) cancelAnimationFrame(entry.frame);
      }
      map.remove();
      mapRef.current = null;
      repLayer.clear();
    };
  }, [counters]);

  // Sync live rep markers whenever positions change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = repLayerRef.current;
    const now = Date.now();

    for (const [userId, pos] of positions) {
      const name = repNames.get(userId);
      if (!name) continue; // not one of ours — ignore
      const stale = now - pos.updatedAt > STALE_AFTER_MS;
      const existing = layer.get(userId);

      // First sighting: place it, don't fly it in from nowhere.
      if (!existing) {
        const marker = L.marker([pos.lat, pos.lng], {
          icon: repIcon(name, stale),
          zIndexOffset: 1000,
        }).addTo(map);
        layer.set(userId, {
          marker,
          frame: null,
          target: { lat: pos.lat, lng: pos.lng },
          targetAt: pos.updatedAt,
          renderedAt: now,
          stale,
        });
        continue;
      }

      // setIcon swaps the marker's DOM node, so only redraw when the icon would
      // actually differ — doing it per update would flicker mid-tween.
      if (existing.stale !== stale) {
        existing.marker.setIcon(repIcon(name, stale));
        existing.stale = stale;
      }

      // Effectively unchanged (heartbeat re-send or GPS jitter): record the fix
      // but leave the marker where it is, so a parked rep stays put.
      const moved = distanceMeters(existing.target.lat, existing.target.lng, pos.lat, pos.lng);
      if (moved < STATIONARY_M) {
        existing.target = { lat: pos.lat, lng: pos.lng };
        existing.targetAt = pos.updatedAt;
        existing.renderedAt = now;
        continue;
      }

      // A newer fix supersedes whatever is in flight. Cancelling first means
      // `animateMarker` reads the marker's real mid-tween position as its start.
      if (existing.frame !== null) {
        cancelAnimationFrame(existing.frame);
        existing.frame = null;
      }

      // Gap checks at both ends: the source clock (silence between fixes) and
      // ours (a suspended/backgrounded tab that just woke up).
      const sourceGap = pos.updatedAt - existing.targetAt;
      const localGap = now - existing.renderedAt;
      const snap = moved > SNAP_DISTANCE_M || sourceGap > SNAP_GAP_MS || localGap > SNAP_GAP_MS;

      if (snap) {
        existing.marker.setLatLng([pos.lat, pos.lng]);
      } else {
        const duration = Math.min(
          MAX_DURATION_MS,
          Math.max(MIN_DURATION_MS, moved * MS_PER_METER),
        );
        animateMarker(existing, { lat: pos.lat, lng: pos.lng }, duration);
      }

      existing.target = { lat: pos.lat, lng: pos.lng };
      existing.targetAt = pos.updatedAt;
      existing.renderedAt = now;
    }

    // Drop markers for reps that are no longer reported.
    for (const [userId, entry] of layer) {
      if (!positions.has(userId)) {
        if (entry.frame !== null) cancelAnimationFrame(entry.frame);
        entry.marker.remove();
        layer.delete(userId);
      }
    }

    // If there were no counters to frame the view, center on the first rep.
    if (!fittedRef.current && positions.size > 0) {
      const first = [...positions.values()][0];
      map.setView([first.lat, first.lng], 14);
      fittedRef.current = true;
    }
  }, [positions, repNames]);

  return (
    <div
      ref={hostRef}
      className="w-full overflow-hidden rounded-2xl border"
      style={{ aspectRatio: "21 / 9", minHeight: 380, borderColor: "var(--hairline-soft)", zIndex: 0 }}
    />
  );
}
