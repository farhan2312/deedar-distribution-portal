"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CnfOption } from "@/lib/supervisor/team";

/**
 * Narrows a Sales Officer screen to one C&F HQ via `?cnf=`.
 *
 * Central Admin only — the page decides that by handing this an empty option
 * list for everyone else, since a Sales Officer already sits under one C&F.
 *
 * Changing the C&F clears `?depot=` and `?page=`: a stockist chosen under the
 * previous C&F does not exist under this one, and leaving it in the URL would
 * silently show "no reps" instead of the C&F that was just picked.
 */
export function CnfPicker({ options, value }: { options: CnfOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    if (next === "all") q.delete("cnf");
    else q.set("cnf", next);
    q.delete("depot");
    q.delete("page");
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => select(e.target.value)}
      aria-label="C&F HQ"
    >
      <option value="all">All C&amp;F</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
