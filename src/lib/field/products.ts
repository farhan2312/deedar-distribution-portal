import type { CompetitorPresence, ProductSegment } from "@/db/schema";
import { istDayBounds } from "@/lib/date";

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
  { value: "national", label: "National Brands" },
];

export const COMPETITOR_LABEL: Record<CompetitorPresence, string> = Object.fromEntries(
  COMPETITOR_OPTIONS.map((c) => [c.value, c.label]),
) as Record<CompetitorPresence, string>;

/**
 * Display label for a visit's competitor presence: the label plus the
 * free-text brand name when one was entered ("Local Brands — Wagh Bakri"),
 * else just the label. Centralised so every read site shows it the same way,
 * mirroring `counterTypeLabel`'s coalesce for counter type.
 */
export function competitorDisplayLabel(
  competitor: CompetitorPresence | null,
  brand: string | null | undefined,
): string {
  if (!competitor) return COMPETITOR_LABEL.none;
  const label = COMPETITOR_LABEL[competitor];
  return competitor !== "none" && brand?.trim() ? `${label} — ${brand.trim()}` : label;
}

/** Max packets sold PER SKU (product segment) in a single visit — applied to
 * each segment independently, not to the combined total. */
export const MAX_SOLD_PER_SKU = 24;

/** MM:SS from a whole number of seconds (used for "time on counter"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * A visit stays editable by its owner until the end of the IST day it was
 * recorded on — i.e. until 23:59 that night, then it locks.
 *
 * This replaced a rolling 24-hour window, which was confusing in the field: a
 * visit logged at 4pm stayed editable until 4pm the NEXT day, so a rep could
 * still be amending yesterday's numbers while today's beat was running.
 * Anchoring to the IST day makes "today's visits" and "editable visits" the
 * same set, and means the day's figures are final once the day is over.
 */
export function isWithinEditWindow(visitedAt: Date, now: Date = new Date()) {
  return visitedAt.getTime() >= istDayBounds(now).start.getTime();
}

/** Earliest `visited_at` still editable — i.e. midnight IST this morning. Used
 * as a query lower bound so a rep's visit history only lists editable visits.
 * In a helper (not a component) so the time read doesn't trip
 * react-hooks/purity. */
export function editableVisitCutoff(now: Date = new Date()): Date {
  return istDayBounds(now).start;
}

/**
 * How long today's visits stay editable, as a short label like "4h 12m" — the
 * gap between now and midnight IST. Null once the window has closed.
 *
 * Rendered server-side, so it's a snapshot at page load rather than a live
 * countdown; that's deliberate, since a ticking clock would need client JS on
 * an otherwise static page.
 */
export function editWindowRemaining(now: Date = new Date()): string | null {
  const ms = istDayBounds(now).end.getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
