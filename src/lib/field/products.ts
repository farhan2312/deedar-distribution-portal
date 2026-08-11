import type { CompetitorPresence, ProductSegment } from "@/db/schema";

export const PRODUCT_SEGMENTS: { value: ProductSegment; label: string }[] = [
  { value: "DG10", label: "Deedar Gold 10g" },
  { value: "DG20", label: "Deedar Gold 20g" },
  { value: "DB20", label: "Deedar Blue 20g" },
  { value: "DB40", label: "Deedar Blue 40g" },
];

export const SEGMENT_LABEL: Record<ProductSegment, string> = Object.fromEntries(
  PRODUCT_SEGMENTS.map((p) => [p.value, p.label]),
) as Record<ProductSegment, string>;

export const COMPETITOR_OPTIONS: { value: CompetitorPresence; label: string }[] = [
  { value: "none", label: "None" },
  { value: "local", label: "Local Brands" },
  { value: "national", label: "Other" },
];

export const COMPETITOR_LABEL: Record<CompetitorPresence, string> = Object.fromEntries(
  COMPETITOR_OPTIONS.map((c) => [c.value, c.label]),
) as Record<CompetitorPresence, string>;

/** A visit stays editable by its owner for this long after it was recorded. */
export const VISIT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cap on total packets sold across all SKUs in a single visit. */
export const MAX_VISIT_SOLD = 24;

/** MM:SS from a whole number of seconds (used for "time on counter"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function isWithinEditWindow(visitedAt: Date, now: Date = new Date()) {
  return now.getTime() - visitedAt.getTime() < VISIT_EDIT_WINDOW_MS;
}
