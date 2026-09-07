/**
 * How the Reports counters tab is ordered.
 *
 * Client-safe on purpose: the picker renders in the browser and the ORDER BY
 * is built on the server, and both must agree on the vocabulary. Defining it
 * in `lib/khq/reports.ts` would have been the natural place and the wrong one
 * — that module is `server-only`, so the import drags the Postgres driver into
 * the client bundle.
 *
 * Newest stays the default: it answers "what changed since I last looked",
 * which is what a report is opened for more often than not. The visit
 * orderings are for the other question — who is being worked, and who is being
 * missed.
 */
export type CounterSort = "new" | "visits" | "least";

export const COUNTER_SORTS: readonly { key: CounterSort; label: string }[] = [
  { key: "new", label: "Newest first" },
  { key: "visits", label: "Most visits" },
  { key: "least", label: "Fewest visits" },
];

export function isCounterSort(s: string | undefined): s is CounterSort {
  return !!s && COUNTER_SORTS.some((o) => o.key === s);
}
