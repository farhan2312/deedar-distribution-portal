"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/**
 * Single-date picker for the ISR detail page, writing `?date=YYYY-MM-DD`.
 *
 * The page answers "what did this ISR do on this day", so it takes one date
 * rather than a range — a range would mean stacking day cards, which is the
 * shape the company dashboard already provides. `min`/`max` bound it to the
 * ISR's own history; the server clamps again, since the URL is hand-editable.
 */
export function IsrDayPicker({
  value,
  minDate,
  maxDate,
}: {
  value: string;
  minDate: string;
  maxDate: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    if (next === maxDate) q.delete("date"); // today is the default — keep the URL clean
    else q.set("date", next);
    const query = q.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }} htmlFor="isr-date">
        {t("Date")}
      </label>
      <input
        id="isr-date"
        type="date"
        className="inp"
        style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
        value={value}
        min={minDate}
        max={maxDate}
        onChange={(e) => e.target.value && select(e.target.value)}
      />
      {value !== maxDate && (
        <button
          type="button"
          onClick={() => select(maxDate)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
        >
          {t("Today")}
        </button>
      )}
    </div>
  );
}
