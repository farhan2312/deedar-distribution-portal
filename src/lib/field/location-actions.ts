"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { parseLocationInput, isShortMapsLink } from "./gps";

export type ResolveResult = { ok: true; coords: string } | { ok: false; error: string };

/** Hosts a short link may redirect through. Anything else ends the chase: this
 * fetch runs on our server, so it must never become a way to make the server
 * request an arbitrary address. */
function isGoogleHost(hostname: string): boolean {
  return (
    hostname === "maps.app.goo.gl" ||
    hostname === "goo.gl" ||
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname === "google.co.in" ||
    hostname.endsWith(".google.co.in")
  );
}

/**
 * Follow a Google Maps short link (`maps.app.goo.gl/…`) to the coordinates it
 * points at.
 *
 * Sharing a place from the Maps app on a phone produces one of these, and it
 * holds no position until it is opened. The browser can't follow it for us —
 * the redirect is cross-origin — so the server does, reading only the
 * `Location` headers and never the pages behind them.
 *
 * Central Admin only, since it is part of entering a counter for someone else.
 */
export async function resolveMapsLink(raw: string): Promise<ResolveResult> {
  const user = await getCurrentUser();
  if (!user?.accessRoles.includes("admin")) return { ok: false, error: "Not authorized." };
  if (!isShortMapsLink(raw)) return { ok: false, error: "Not a Google Maps short link." };

  let current = new URL(raw.trim());
  // A short link usually lands on the full Maps URL in one hop; allow a few in
  // case Google routes it through a consent or regional host first.
  for (let hop = 0; hop < 4; hop++) {
    let location: string | null;
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        // Without a browser-like agent Google sometimes answers with an
        // interstitial page instead of the redirect.
        headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36" },
      });
      location = res.headers.get("location");
    } catch {
      return { ok: false, error: "Couldn't open that link — check the connection, or paste the coordinates instead." };
    }
    if (!location) break;

    const next = new URL(location, current);
    const coords = parseLocationInput(next.toString());
    if (coords) return { ok: true, coords };
    if (next.protocol !== "https:" || !isGoogleHost(next.hostname)) break;
    current = next;
  }
  return {
    ok: false,
    error: "That link doesn't carry a position — open it, long-press the shop, and paste the coordinates instead.",
  };
}
