// Plain module (no "use client") so BOTH the client map (`live-map.tsx`) and the
// server legend (`team-map-view.tsx`) can import these real values. Exporting
// them from the client module instead handed the server a client-reference
// proxy, so `COUNTER_COLORS.visited` came back undefined and the legend dots
// rendered with no background.

/**
 * Counter dot colours by state, shared with the map legend so the two never
 * drift. A counter is yellow by default; assigning it to a beat turns it grey
 * (pending); visiting it turns it green.
 */
export const COUNTER_COLORS = {
  visited: "#1E9E5A", // green
  pending: "#8A8F98", // grey — assigned, not visited
  counter: "#E0A100", // yellow — a plain counter
} as const;

/** Live rep marker colour (shared with the legend). */
export const REP_LIVE_COLOR = "#2E5FA3";
