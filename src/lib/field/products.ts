import type { CompetitorPresence, ProductSegment } from "@/db/schema";

export const PRODUCT_SEGMENTS: { value: ProductSegment; label: string }[] = [
  { value: "DG10", label: "DG10 — Deedar Green 10" },
  { value: "DG20", label: "DG20 — Deedar Green 20" },
  { value: "DB20", label: "DB20 — Deedar Blue 20" },
  { value: "DB40", label: "DB40 — Deedar Blue 40" },
];

export const SEGMENT_LABEL: Record<ProductSegment, string> = Object.fromEntries(
  PRODUCT_SEGMENTS.map((p) => [p.value, p.label]),
) as Record<ProductSegment, string>;

export const COMPETITOR_OPTIONS: { value: CompetitorPresence; label: string }[] = [
  { value: "none", label: "None" },
  { value: "local", label: "Local Brands" },
  { value: "national", label: "National Brands" },
];

export const COMPETITOR_LABEL: Record<CompetitorPresence, string> = Object.fromEntries(
  COMPETITOR_OPTIONS.map((c) => [c.value, c.label]),
) as Record<CompetitorPresence, string>;

/** A visit stays editable by its owner for this long after it was recorded. */
export const VISIT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinEditWindow(visitedAt: Date, now: Date = new Date()) {
  return now.getTime() - visitedAt.getTime() < VISIT_EDIT_WINDOW_MS;
}
