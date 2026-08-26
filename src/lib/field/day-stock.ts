import type { DayStockItem, ProductSegment } from "@/db/schema";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";

export const SEGMENTS: ProductSegment[] = PRODUCT_SEGMENTS.map((p) => p.value);

/** Quantity per SKU, the shape the day-log stock forms hold in state. */
export type SegQty = Record<ProductSegment, number>;

export function zeroQty(): SegQty {
  return { DG10: 0, DG20: 0, DB20: 0, DB40: 0 };
}

/** Stored rows → a dense map, so a missing SKU reads as 0 rather than undefined. */
export function qtyFromItems(items: DayStockItem[] | null | undefined): SegQty {
  const m = zeroQty();
  for (const it of items ?? []) {
    if (it && it.segment in m) m[it.segment] = Number(it.qty) || 0;
  }
  return m;
}

/**
 * Map → storable rows, clamped to whole non-negative numbers.
 *
 * Every SKU is written, including zeros: an explicit 0 is a real statement
 * ("carried none of this"), and keeping the array dense means a reader never
 * has to distinguish "not recorded" from "recorded as none".
 */
export function itemsFromQty(qty: SegQty): DayStockItem[] {
  return SEGMENTS.map((segment) => ({ segment, qty: clampQty(qty[segment]) }));
}

export function totalOf(qty: SegQty): number {
  return SEGMENTS.reduce((sum, seg) => sum + clampQty(qty[seg]), 0);
}

/** Packet counts are whole and never negative; anything else is a typo. */
export function clampQty(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * How much of a day's pickup has been sold, 0–100.
 *
 * Null when nothing was picked up — that is a different state from 0%: there
 * is no target to measure against, so callers show effort (or nothing) rather
 * than implying the rep missed one. Capped at 100 so selling carried-over
 * stock can't overflow a progress bar.
 */
export function soldAgainstPickup(sold: number, pickup: number): number | null {
  if (pickup <= 0) return null;
  return Math.min(100, Math.round((sold / pickup) * 100));
}

/** Shared colour ramp for a "sold against pickup" bar, so the leaderboard and
 * the rep page grade the same number the same way. */
export function pickupBarColor(pct: number | null): string {
  if (pct == null) return "var(--ink-3)";
  return pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--accent)" : "var(--warning)";
}
