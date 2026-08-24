"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DayOption = { value: string; label: string };

/**
 * Day selector for the analytics screen, limited to the three days an SO
 * actually acts on: today, yesterday and the day before.
 *
 * This replaced a free `<input type="date">`. The calendar let an SO open any
 * day in history, which sounds useful but isn't what this screen is for —
 * every card on it ("Visits today by rep", "on job", live status) describes a
 * working day the SO can still do something about. Older days belong in a
 * report, not here.
 *
 * The URL contract is unchanged: `?date=YYYY-MM-DD`, dropped when it equals
 * today so the default URL stays clean, and every other param preserved so it
 * still composes with the depot picker.
 */
export function DayPicker({ value, options }: { value: string; options: DayOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    // The first option is today — the page's default, so it needs no param.
    if (next === options[0]?.value) q.delete("date");
    else q.set("date", next);
    const query = q.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
      onChange={(e) => select(e.target.value)}
      aria-label="Day"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
