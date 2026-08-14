// Counter type constants + display label, shared by the new-counter wizard,
// the edit form, and every read path that shows a counter's type. Kept
// separate from products.ts (which is about visit line items, not counters).

export type CounterType = "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";

export const ALL_COUNTER_TYPES: CounterType[] = [
  "Kirana",
  "Paan",
  "Tea Stall",
  "Wholesale",
  "Vegetable Shop",
  "Others",
];

/**
 * Display label for a counter's type: the free-text `typeOther` value when the
 * type is "Others" and a label was actually entered, else the type itself.
 *
 * Centralised so every list/detail screen shows the manual label the same way,
 * without each read query hand-rolling the same coalesce.
 */
export function counterTypeLabel(type: string, typeOther: string | null | undefined): string {
  return type === "Others" && typeOther?.trim() ? typeOther.trim() : type;
}
