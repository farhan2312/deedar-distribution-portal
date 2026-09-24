"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StockistOption } from "@/lib/supervisor/team";

/** Filters a screen to one depot (or all) via ?depot=. Other query params are
 * preserved, so this composes with the C&F picker on the HQ map — except page
 * numbers, which are dropped: a narrower list rarely reaches the page the
 * reader was on, and landing on a clamped page reads as missing data. */
export function DepotPicker({ options, value }: { options: StockistOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("depot", next);
    q.delete("page");
    q.delete("hpage");
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => select(e.target.value)}
      aria-label="Stockist"
    >
      <option value="all">All stockists</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
