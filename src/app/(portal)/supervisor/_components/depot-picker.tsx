"use client";

import { usePathname, useRouter } from "next/navigation";
import type { DepotOption } from "@/lib/supervisor/team";

/** Filters a supervisor screen to one supervised depot (or all) via ?depot=. */
export function DepotPicker({ options, value }: { options: DepotOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => router.push(`${pathname}?depot=${e.target.value}`)}
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
