/** Message shown wherever a counter is saved without usable coordinates. Kept
 * in one place so the field wizard, the SO wizard, the edit form and all three
 * server actions word it identically. */
export const GPS_REQUIRED = "Capture the counter's GPS location before saving.";

export type Coords = { lat: string; lng: string };

/**
 * Parse the `"lat, lng"` string the capture button produces.
 *
 * Returns null for anything unusable — blank, malformed, out of range, or the
 * null island (0, 0), which is what a failed fix tends to look like rather than
 * a real counter position. Callers treat null as "reject the save": a counter
 * with no coordinates can't be plotted on the map or routed to, so accepting
 * one just defers the problem to whoever has to visit it.
 */
export function parseCoords(gps: string): Coords | null {
  const parts = gps.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  // Stored as the original strings so the captured precision survives — the
  // numbers above are only used for validation.
  return { lat: parts[0], lng: parts[1] };
}
