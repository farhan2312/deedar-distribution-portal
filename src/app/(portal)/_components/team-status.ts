/**
 * The team roster's row shape and status vocabulary.
 *
 * Split out of `team-map-view` because the roster is now a client component
 * and that file is a server one: importing the server module for a type would
 * drag `getT` (and the DB behind it) into the browser bundle.
 */
export type RepStatus = "done" | "active" | "idle" | "off";

export const STATUS_STYLE: Record<RepStatus, { label: string; bg: string; color: string }> = {
  done: { label: "Day closed", bg: "rgba(140,180,201,.2)", color: "#3E6B85" },
  active: { label: "On counter", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  idle: { label: "Idle", bg: "rgba(224,177,92,.2)", color: "#B25E00" },
  off: { label: "Not started", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

export function repStatus(
  startAt: Date | null,
  endAt: Date | null,
  visitedToday: boolean,
): RepStatus {
  if (endAt) return "done";
  if (!startAt) return "off";
  return visitedToday ? "active" : "idle";
}

export type TeamRepRow = {
  id: string;
  name: string;
  status: RepStatus;
  /** Where they were last seen — area of their most recent visit, or depot. */
  area: string;
  visits: number;
  counters: number;
  lastLabel: string;
  onJob: string;
  started: boolean;
  /** Packets sold across today's visits. */
  sold: number;
  /** Packets carried out this morning, off the day log. 0 until they start. */
  pickup: number;
  /** Their most recent visit's coordinates — where the map goes when they have
   * no live marker to fly to. */
  lastLat: number | null;
  lastLng: number | null;
};
