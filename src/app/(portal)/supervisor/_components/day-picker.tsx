"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Single-day selector for the analytics screen. Writes `?date=YYYY-MM-DD`
 * (dropped when it equals today, to keep the default URL clean) and preserves
 * every other param — so it composes with the depot picker. Capped at `max`
 * (today) so a future day can't be picked.
 */
export function DayPicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const day = next || max; // clearing the input falls back to today
    const q = new URLSearchParams(params.toString());
    if (day >= max) q.delete("date");
    else q.set("date", day);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <input
      type="date"
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      max={max}
      onChange={(e) => select(e.target.value)}
      aria-label="Date"
    />
  );
}
