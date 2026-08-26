"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

export type TrendBar = {
  /** X-axis label — a short month name in year mode, a day-of-month in month mode. */
  label: string;
  value: number;
  /** Month number (1-12) a bar drills into. Null for day bars — days are the
   * finest grain we go to, so they aren't clickable. */
  drillMonth: number | null;
  /** Range a click narrows to. Set on month bars only. */
  drillFrom?: string;
  drillTo?: string;
  /** Marks today's day / the current month, so "so far" periods read as
   * partial rather than as a real drop-off. */
  isCurrent?: boolean;
};

/**
 * Packets-sold bar chart with drill-down.
 *
 * Year mode shows 12 month bars; clicking one navigates to `?month=N` and the
 * whole dashboard re-scopes to that month, where this same chart re-renders as
 * day bars. Bars are real buttons (not SVG rects) so they're keyboard-focusable
 * and get the hover/active affordances for free.
 */
export function SalesTrend({
  bars,
  drillable,
}: {
  bars: TrendBar[];
  /** True when bars are months — enables the click-through. */
  drillable: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const max = Math.max(1, ...bars.map((b) => b.value));
  const total = bars.reduce((s, b) => s + b.value, 0);

  // Drilling now narrows the dashboard's date range rather than setting a
  // year/month pair — same gesture, but it composes with the time slider
  // instead of fighting it.
  function drill(from: string, to: string) {
    const q = new URLSearchParams(params.toString());
    q.set("from", from);
    q.set("to", to);
    router.push(`${pathname}?${q.toString()}`);
  }

  if (total === 0) {
    return (
      <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        {t("No sales in this period.")}
      </p>
    );
  }

  return (
    <div className="mt-3">
      {/* Fixed height so bars have something to grow against; items-end so they
          rise from a common baseline. */}
      <div className="flex h-[150px] items-end gap-[3px]">
        {bars.map((b, i) => {
          const pct = (b.value / max) * 100;
          const label = `${b.label}: ${b.value.toLocaleString("en-IN")} ${t("packets")}`;
          const inner = (
            <>
              {/* Bar. min-height keeps a zero bar visible as a hairline so the
                  axis doesn't look gappy. */}
              <span
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(pct, 1.5)}%`,
                  background: b.isCurrent ? "var(--accent)" : "var(--accent-tint)",
                  border: b.isCurrent ? "none" : "1px solid var(--accent)",
                  borderBottom: "none",
                  opacity: b.value === 0 ? 0.35 : 1,
                }}
              />
            </>
          );

          return drillable && b.drillFrom && b.drillTo ? (
            <button
              key={i}
              type="button"
              onClick={() => drill(b.drillFrom!, b.drillTo!)}
              title={`${label} — ${t("click to open")}`}
              aria-label={label}
              className="flex h-full flex-1 cursor-pointer flex-col justify-end rounded-t transition-opacity hover:opacity-80"
            >
              {inner}
            </button>
          ) : (
            <div
              key={i}
              title={label}
              className="flex h-full flex-1 flex-col justify-end"
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* X axis. In month mode there can be 31 labels, so only every 5th day is
          printed — otherwise they overlap into mush on a phone. */}
      <div className="mt-1.5 flex gap-[3px]">
        {bars.map((b, i) => {
          const show = drillable || i === 0 || (i + 1) % 5 === 0 || i === bars.length - 1;
          return (
            <div
              key={i}
              className="flex-1 truncate text-center text-[9.5px]"
              style={{ color: b.isCurrent ? "var(--accent)" : "var(--ink-3)" }}
            >
              {show ? (drillable ? t(b.label) : b.label) : ""}
            </div>
          );
        })}
      </div>

      {drillable && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
          {t("Click a month to see it day by day.")}
        </p>
      )}
    </div>
  );
}
