"use client";

import { usePathname, useRouter } from "next/navigation";
import type { DepotOption } from "@/lib/depot/data";

/** Admin depot picker for the Depot portal (no "all" — data is per-depot). */
export function DepotSelect({ options, value }: { options: DepotOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => router.push(`${pathname}?depot=${e.target.value}`)}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
