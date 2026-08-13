"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DepotOption } from "@/lib/supervisor/team";

/** Filters a screen to one depot (or all) via ?depot=. Other query params are
 * preserved, so this composes with the C&F picker on the HQ map. */
export function DepotPicker({ options, value }: { options: DepotOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("depot", next);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => select(e.target.value)}
      aria-label="Depot"
    >
      <option value="all">All depots</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
