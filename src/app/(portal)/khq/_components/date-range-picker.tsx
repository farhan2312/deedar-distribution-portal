"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/**
 * From / to date pickers for the company dashboard, writing `?from=&to=`.
 *
 * Two native date inputs rather than a custom control: they open the platform
 * calendar, accept typed dates, and work with a keyboard and a screen reader
 * without any of that being reimplemented. `min`/`max` stop a range being
 * picked outside the data, and the server clamps again in `resolveRange` — the
 * URL is editable by hand, so the client bound is a convenience, not the rule.
 *
 * Each end commits on change, so picking "from" reloads before "to" is
 * touched. That is deliberate: the page is still valid mid-edit, and holding
 * an Apply button hostage behind two fields is worse for the common case of
 * changing only one end.
 */
export function DateRangePicker({
  from,
  to,
  minDate,
  maxDate,
}: {
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(nextFrom: string, nextTo: string) {
    // Dragging one end past the other swaps them rather than producing an
    // empty range the user then has to undo.
    const a = nextFrom <= nextTo ? nextFrom : nextTo;
    const b = nextFrom <= nextTo ? nextTo : nextFrom;
    const q = new URLSearchParams(params.toString());
    q.set("from", a);
    q.set("to", b);
    router.push(`${pathname}?${q.toString()}`);
  }

  const ytdFrom = `${maxDate.slice(0, 4)}-01-01`;
  const isYtd = from === ytdFrom && to === maxDate;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <label className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }} htmlFor="range-from">
          {t("From")}
        </label>
        <input
          id="range-from"
          type="date"
          className="inp"
          style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
          value={from}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && apply(e.target.value, to)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }} htmlFor="range-to">
          {t("To")}
        </label>
        <input
          id="range-to"
          type="date"
          className="inp"
          style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
          value={to}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && apply(from, e.target.value)}
        />
      </div>
      {/* One-click return to the default, since it is the view people live in. */}
      {!isYtd && (
        <button
          type="button"
          onClick={() => apply(ytdFrom, maxDate)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
        >
          {t("YTD")}
        </button>
      )}
    </div>
  );
}
