"use client";

import { usePathname, useRouter } from "next/navigation";
import type { StockistOption } from "@/lib/depot/data";

/** Admin depot picker for the Depot portal (no "all" — data is per-depot). */
export function DepotSelect({
  options,
  value,
  rollupLabel,
}: {
  options: StockistOption[];
  value: string;
  /** When set, prepends a combined "everything in scope" option. Used by a
   * dealer to see their own stock and their sub-dealers' as one figure. */
  rollupLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => router.push(`${pathname}?depot=${e.target.value}`)}
    >
      {rollupLabel && <option value="all">{rollupLabel}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
