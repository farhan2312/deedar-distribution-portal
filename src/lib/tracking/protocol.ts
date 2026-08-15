// Wire protocol + tuning shared by the Next.js app and the standalone
// WebSocket service. Kept dependency-free so the WS server can import it
// directly (it must NOT pull in "server-only" or next/* modules).

/** Purpose claim baked into a tracking ticket, so a normal session cookie
 * can never be replayed as a WebSocket credential (and vice versa). */
export const WS_TICKET_PURPOSE = "tracking-ws";

/** Tickets are single-use-ish and short-lived — just long enough to connect. */
export const WS_TICKET_TTL_SECONDS = 60;

export type TicketClaims = {
  userId: string;
  /** "rep" sends its own location; "watcher" subscribes to its authorized team. */
  role: "rep" | "watcher";
  purpose: typeof WS_TICKET_PURPOSE;
};

// ── Payloads ────────────────────────────────────────────────────────────

/** A rep reporting its own position. The server NEVER trusts a user id from
 * the client — the connection's authenticated identity is used instead. */
export type LocationReport = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  /** Device clock time of the fix (ms epoch). */
  recordedAt: number;
};

export type RepPosition = {
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** Server receive time (ms epoch) — use this for staleness, not device time. */
  updatedAt: number;
};

/** Reply to an emitted `location` (Socket.IO acknowledgement callback). */
export type LocationAck = { ok: true; at: number } | { ok: false; error: string };

// ── Typed Socket.IO events ──────────────────────────────────────────────
// Both sides import these so the event names and payloads can't drift apart.

/** Server → client. */
export type ServerToClientEvents = {
  ready: (payload: { role: "rep" | "watcher" }) => void;
  /** Watcher only: every authorized rep's last known position, on subscribe. */
  snapshot: (payload: { positions: RepPosition[] }) => void;
  /** Watcher only: a single rep moved. */
  position: (payload: RepPosition) => void;
  /** Fatal-ish problem; the server may also disconnect. */
  trackingError: (payload: { message: string }) => void;
};

/** Client → server. */
export type ClientToServerEvents = {
  /** Rep only. Acknowledged so the client knows the row was written. */
  location: (payload: LocationReport, ack?: (res: LocationAck) => void) => void;
  /** Watcher only. Carries NO ids — the server derives the authorized set. */
  subscribe: () => void;
};

/** Handshake auth payload (`io(url, { auth })`). */
export type HandshakeAuth = { ticket: string };

// ── Client-side reporting policy ────────────────────────────────────────
// Event-driven (Geolocation watchPosition), never a fixed poll loop:
// report when the rep has actually MOVED a meaningful distance, plus a slow
// heartbeat so the server can tell a parked device from a dead one.

/** Minimum movement before we spend an update, in metres. */
export const MIN_MOVE_METERS = 15;
/** Send at least this often even when stationary (ms). */
export const HEARTBEAT_MS = 60_000;
/** Ignore fixes worse than this accuracy (metres) — usually IP/wifi guesses. */
export const MAX_ACCURACY_METERS = 200;
/** A position older than this is shown as stale on the map (ms). */
export const STALE_AFTER_MS = 5 * 60_000;

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
