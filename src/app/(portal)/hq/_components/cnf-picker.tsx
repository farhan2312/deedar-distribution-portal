"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CnfOption } from "@/lib/hq/scope";

export function CnfPicker({ options, value }: { options: CnfOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("cnf", next);
    // A depot from the previous C&F is meaningless here — drop it so the view
    // falls back to "all depots" in the newly selected C&F.
    q.delete("depot");
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => select(e.target.value)}
      aria-label="C&F HQ"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
