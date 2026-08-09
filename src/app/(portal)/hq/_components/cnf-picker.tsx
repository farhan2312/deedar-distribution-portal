"use client";

import { usePathname, useRouter } from "next/navigation";
import type { CnfOption } from "@/lib/hq/scope";

export function CnfPicker({ options, value }: { options: CnfOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => router.push(`${pathname}?cnf=${e.target.value}`)}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
