"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import type { TrendBar } from "./sales-trend";

export type StockistSeries = {
  id: string;
  name: string;
  /** Packets sold in the whole period. */
  packets: number;
  /** Packets per trend bucket — "2026-08" in year mode, "2026-08-14" in month
   * mode. Missing keys are zero. */
  byBucket: Record<string, number>;
};

export type StateSeries = {
  id: string;
  name: string;
  packets: number;
  stockists: StockistSeries[];
};

/**
 * Three histograms, drilling down the way the org chart does: state →
 * stockist → month → day.
 *
 * The top two are totals for the period, so a click on either is just a
 * selection and the page does not reload. The bottom chart is the selected
 * stockist's own sales trend, and clicking one of ITS bars drills the whole
 * dashboard into that month — the same navigation the company trend above
 * does, because a month bar meaning two different things on one page would be
 * the confusing part.
 *
 * Every chart is scaled to its own tallest bar: the question in each is "who
 * or when is carrying this", not "how does this compare to the level above".
 */
export function StateBreakdown({
  states,
  trendBars,
  drillable,
}: {
  states: StateSeries[];
  /** The company trend's bars — reused for labels, bucket keys and drill
   * ranges so the stockist chart's months line up with the one above it. */
  trendBars: TrendBar[];
  /** True when the bars are months, i.e. there is a day view to drill into. */
  drillable: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ordered = [...states].sort((a, b) => b.packets - a.packets || a.name.localeCompare(b.name));
  const [stateId, setStateId] = useState<string | null>(ordered[0]?.id ?? null);
  const selectedState = ordered.find((s) => s.id === stateId) ?? ordered[0] ?? null;

  const stockists = selectedState
    ? [...selectedState.stockists].sort((a, b) => b.packets - a.packets || a.name.localeCompare(b.name))
    : [];
  const [stockistId, setStockistId] = useState<string | null>(null);
  // Falls back to the state's biggest seller, so changing state always leaves a
  // stockist selected rather than an empty third chart.
  const selectedStockist = stockists.find((s) => s.id === stockistId) ?? stockists[0] ?? null;

  /** Narrow the dashboard to one month — identical to the company trend's
   * drill, including dropping `?period=`, which would otherwise leave a pill
   * lit that no longer describes what is on screen. */
  function drill(from: string, to: string) {
    const q = new URLSearchParams(params.toString());
    q.set("from", from);
    q.set("to", to);
    q.delete("period");
    router.push(`${pathname}?${q.toString()}`);
  }

  if (ordered.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        {t("No states onboarded yet.")}
      </p>
    );
  }

  return (
    <div className="mt-1">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <Histogram
          title={t("By state")}
          peakLabel={t("top state")}
          hint={t("Click a state to see its stockists.")}
          bars={ordered.map((s) => ({
            id: s.id,
            label: s.name,
            value: s.packets,
            current: s.id === selectedState?.id,
            onClick: () => {
              setStateId(s.id);
              // The stockist selection belonged to the old state; clearing it
              // lets the fallback pick this state's biggest seller.
              setStockistId(null);
            },
          }))}
          t={t}
        />

        <Histogram
          title={selectedState ? `${selectedState.name} — ${t("by stockist")}` : t("By stockist")}
          peakLabel={t("top stockist")}
          hint={t("Click a stockist to see its months.")}
          emptyLabel={t("No stockists under this state yet.")}
          bars={stockists.map((s) => ({
            id: s.id,
            label: s.name,
            value: s.packets,
            current: s.id === selectedStockist?.id,
            onClick: () => setStockistId(s.id),
          }))}
          t={t}
        />
      </div>

      <div className="my-5 h-px" style={{ background: "var(--hairline-soft)" }} />

      <Histogram
        title={
          selectedStockist
            ? `${selectedStockist.name} — ${drillable ? t("by month") : t("by day")}`
            : t("By month")
        }
        peakLabel={drillable ? t("peak month") : t("peak day")}
        hint={drillable ? t("Click a month to see it day by day.") : undefined}
        emptyLabel={t("No stockists under this state yet.")}
        bars={trendBars.map((b) => ({
          id: b.key,
          label: b.label,
          value: selectedStockist?.byBucket[b.key] ?? 0,
          // The current month is filled in; the rest are outlined, matching the
          // trend above.
          current: !!b.isCurrent,
          onClick:
            drillable && b.drillFrom && b.drillTo
              ? () => drill(b.drillFrom!, b.drillTo!)
              : undefined,
        }))}
        // A year of months is a lot of labels on a phone; the trend above
        // thins them the same way.
        thinLabels={!drillable}
        t={t}
      />
    </div>
  );
}

type Bar = {
  id: string;
  label: string;
  value: number;
  current: boolean;
  onClick?: () => void;
};

/** One bar chart, scaled to its own tallest bar. */
function Histogram({
  title,
  peakLabel,
  bars,
  hint,
  emptyLabel,
  thinLabels,
  t,
}: {
  title: string;
  peakLabel: string;
  bars: Bar[];
  hint?: string;
  emptyLabel?: string;
  thinLabels?: boolean;
  t: (key: string) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0]);
  // Above about a dozen bars the number over each one turns into a smear.
  const showValues = bars.length <= 14;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="truncate text-[13.5px] font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
        >
          {title}
        </h3>
        {bars.length > 0 && (
          <span className="flex-none text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            <b className="text-[13px] tabular-nums" style={{ color: "var(--ink-1)" }}>
              {peak.value.toLocaleString("en-IN")}
            </b>{" "}
            {peakLabel}
          </span>
        )}
      </div>

      {bars.length === 0 ? (
        <p className="py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {emptyLabel}
        </p>
      ) : (
        <>
          <div className="flex h-[150px] items-end gap-[3px] lg:h-[190px]">
            {bars.map((b) => {
              const pct = (b.value / max) * 100;
              const label = `${b.label}: ${b.value.toLocaleString("en-IN")} ${t("packets")}`;
              const column = (
                <>
                  {showValues && (
                    <span
                      className="mb-1 block w-full truncate text-center text-[10.5px] font-bold tabular-nums"
                      style={{ color: b.value > 0 ? "var(--ink-1)" : "var(--ink-3)" }}
                    >
                      {b.value.toLocaleString("en-IN")}
                    </span>
                  )}
                  <span
                    className="block w-full rounded-t transition-all"
                    style={{
                      // A zero bar stays a visible hairline, so the baseline
                      // reads as an axis rather than a gap.
                      height: `${Math.max(pct, 1.5)}%`,
                      background: b.current ? "var(--accent)" : "var(--accent-tint)",
                      // Three longhands, not `border` plus `borderBottom:
                      // none`: React applies a shorthand and its longhands in
                      // no guaranteed order on a re-render, so the "none" can
                      // be overwritten and draw a line along the axis.
                      borderTop: b.current ? "none" : "1px solid var(--accent)",
                      borderLeft: b.current ? "none" : "1px solid var(--accent)",
                      borderRight: b.current ? "none" : "1px solid var(--accent)",
                      opacity: b.value === 0 ? 0.4 : 1,
                    }}
                  />
                </>
              );

              return b.onClick ? (
                <button
                  key={b.id}
                  type="button"
                  onClick={b.onClick}
                  title={label}
                  aria-label={label}
                  aria-pressed={b.current}
                  className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end transition-opacity hover:opacity-80"
                >
                  {column}
                </button>
              ) : (
                <div key={b.id} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  {column}
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 flex gap-[3px]">
            {bars.map((b, i) => {
              const show = !thinLabels || i === 0 || (i + 1) % 5 === 0 || i === bars.length - 1;
              return (
                <span
                  key={b.id}
                  className="min-w-0 flex-1 truncate text-center text-[10.5px]"
                  style={{
                    color: b.current ? "var(--accent)" : "var(--ink-3)",
                    fontWeight: b.current ? 700 : 400,
                  }}
                  title={b.label}
                >
                  {show ? b.label : ""}
                </span>
              );
            })}
          </div>

          {hint && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
              {hint}
            </p>
          )}
        </>
      )}
    </div>
  );
}
