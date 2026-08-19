"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/** Local copy of the month keys. Can't import the one in `lib/khq/period.ts`
 * here — that module is `server-only`. The server side of the dashboard uses
 * that module's export; this array must stay identical to it. */
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Year + month selector for the company dashboard. Selection lives in the URL
 * (`?year=&month=`), so the server re-resolves the period and the page is
 * linkable / back-button friendly — same approach as the map/report pickers.
 *
 * Every change writes an explicit `year`, so "Whole year" (month cleared) is
 * unambiguous: `?year=2026` = whole year, `?year=2026&month=8` = one month.
 */
export function PeriodPicker({
  years,
  year,
  month,
}: {
  years: number[];
  year: number;
  month: number | null;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(nextYear: number, nextMonth: number | null) {
    const q = new URLSearchParams(params.toString());
    q.set("year", String(nextYear));
    if (nextMonth == null) q.delete("month");
    else q.set("month", String(nextMonth));
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="inp"
        style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
        value={year}
        onChange={(e) => apply(Number(e.target.value), month)}
        aria-label={t("Year")}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        className="inp"
        style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
        value={month ?? "all"}
        onChange={(e) => apply(year, e.target.value === "all" ? null : Number(e.target.value))}
        aria-label={t("Month")}
      >
        <option value="all">{t("Whole year")}</option>
        {MONTH_SHORT.map((m, i) => (
          <option key={m} value={i + 1}>{t(m)}</option>
        ))}
      </select>
    </div>
  );
}
