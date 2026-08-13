"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STALE_AFTER_MS, type RepPosition } from "@/lib/tracking/protocol";

export type CounterPin = {
  id: string;
  name: string;
  /** Counter type, e.g. "Tea Stall". */
  type: string;
  area: string;
  status: string;
  lat: number;
  lng: number;
  visited: boolean;
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

/** Counter detail card shown when a pin is clicked. */
function counterPopup(c: CounterPin): string {
  const meta = [c.type, c.area].filter(Boolean).map(esc).join(" · ");
  const facts = [`Stock: ${c.stock}`, c.lastVisitLabel ? `Last visit: ${esc(c.lastVisitLabel)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    `<div style="min-width:150px;font-family:var(--font-sans)">` +
    `<div style="font:700 13.5px/1.3 inherit;color:#221f3a">${esc(c.name)}</div>` +
    `<div style="font-size:11.5px;color:#8a88a3;margin-top:2px">${meta}</div>` +
    `<div style="font-size:11.5px;color:#5d5b76;margin-top:3px">${facts}</div>` +
    (c.visited
      ? `<div style="font-size:11.5px;font-weight:600;color:#1E9E5A;margin-top:4px">Visited today</div>`
      : "") +
    `</div>`
  );
}

function counterColor(p: CounterPin): string {
  if (p.visited) return "#1E9E5A";
  if (p.status === "declining") return "#C7263B";
  return "#8A8F98";
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
  const repLayerRef = useRef<Map<string, L.Marker>>(new Map());
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
      if (existing) {
        existing.setLatLng([pos.lat, pos.lng]);
        existing.setIcon(repIcon(name, stale));
      } else {
        const marker = L.marker([pos.lat, pos.lng], {
          icon: repIcon(name, stale),
          zIndexOffset: 1000,
        }).addTo(map);
        layer.set(userId, marker);
      }
    }

    // Drop markers for reps that are no longer reported.
    for (const [userId, marker] of layer) {
      if (!positions.has(userId)) {
        marker.remove();
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
