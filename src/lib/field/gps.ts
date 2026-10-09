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

/** Same message, for the admin form — which takes typed coordinates, not a
 * device fix, so "capture" would tell them to do something the form can't. */
export const LOCATION_REQUIRED =
  "Enter the counter's location — coordinates or a Google Maps link.";

/**
 * Coordinates out of whatever an admin pastes, as the `"lat, lng"` string
 * `parseCoords` accepts — or null when nothing usable is in it.
 *
 * Central Admin enters counters on behalf of reps who had no signal, so the
 * position arrives secondhand: typed off a phone over SMS, or as a link someone
 * shared. The forms that turn up in practice, most precise first:
 *
 * - `25.7716, 75.8537` — what Google Maps shows when you long-press a spot.
 * - `25°46'17.8"N 75°51'13.3"E` — the same point as desktop Maps prints it.
 * - `…!3d25.7716!4d75.8537…` — a place link; this is the marker itself.
 * - `?q=25.7716,75.8537` (also `query=`, `ll=`, `daddr=`) and `geo:` links —
 *   what WhatsApp's location share and this app's own map links carry.
 * - `…/@25.7716,75.8537,17z` — the map's centre when the link was copied. The
 *   loosest of the lot, so it is only used when nothing better is present.
 *
 * Short links (`maps.app.goo.gl/…`) carry no coordinates at all until they are
 * followed; `resolveMapsLink` does that on the server and hands the result back
 * through this same function.
 */
export function parseLocationInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const pair = (a: string, b: string): string | null => {
    const lat = Number(a);
    const lng = Number(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (lat === 0 && lng === 0) return null;
    // Six places is ~10 cm, and what the column holds (numeric(10,6)).
    return `${Number(lat.toFixed(6))}, ${Number(lng.toFixed(6))}`;
  };

  // Plain pair: "25.7716, 75.8537", "25.7716,75.8537", "25.7716 75.8537".
  const plain = s.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (plain) return pair(plain[1], plain[2]);

  // Degrees–minutes–seconds, either hemisphere.
  const dms = s.match(
    /(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([EW])/i,
  );
  if (dms) {
    const deg = (d: string, m: string, sec: string, hemi: string) =>
      (Number(d) + Number(m) / 60 + Number(sec) / 3600) * (/[SW]/i.test(hemi) ? -1 : 1);
    return pair(
      String(deg(dms[1], dms[2], dms[3], dms[4])),
      String(deg(dms[5], dms[6], dms[7], dms[8])),
    );
  }

  // Links arrive percent-encoded as often as not ("q=25.77%2C75.85").
  let text = s;
  try {
    text = decodeURIComponent(s);
  } catch {
    // A stray "%" in pasted text — read it as it came.
  }
  const num = String.raw`(-?\d{1,3}\.\d+)`;
  const patterns = [
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll|daddr|destination|center)=${num}\s*,\s*${num}`),
    new RegExp(String.raw`^geo:${num},${num}`, "i"),
    new RegExp(String.raw`@${num},${num}`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return pair(m[1], m[2]);
  }
  return null;
}

/** A Google Maps short link, which has to be followed before it says anything. */
export function isShortMapsLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return (
      url.protocol === "https:" &&
      (url.hostname === "maps.app.goo.gl" ||
        (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}
