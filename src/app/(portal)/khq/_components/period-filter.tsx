"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { SPAN_PRESETS, type PeriodKey, type Preset } from "@/lib/khq/periods";

type Selection = { period: PeriodKey | null; from: string; to: string };

/**
 * The period filter shared by the company dashboard, the ISR detail page and
 * Reports: preset pills for the windows people actually ask for, then two
 * native date inputs for everything else.
 *
 * Selection lives in the URL so the server re-resolves it and the view stays
 * linkable and back-button friendly. A pill writes `?period=` and clears any
 * `from`/`to`; a calendar writes `?from=&to=` and clears `period`. Keeping
 * them mutually exclusive is what stops a stale pill from overriding the date
 * somebody just picked — the server applies the same precedence.
 *
 * Selecting is optimistic. The props are the server's answer, which only
 * arrives once the whole page has re-rendered against the new dates; painting
 * the pill from them made every click feel like it had missed. `useOptimistic`
 * shows the new selection on the same frame as the click and then defers back
 * to the server value when the transition settles, so a rejected or clamped
 * range still ends up displaying what the server actually resolved.
 *
 * Native date inputs rather than a custom calendar: they open the platform
 * picker, accept typed dates, and work with a keyboard and a screen reader
 * without any of that being reimplemented. `min`/`max` bound them to the data;
 * the server clamps again, since the URL is hand-editable.
 */
export function PeriodFilter({
  period,
  from,
  to,
  minDate,
  maxDate,
  /** Which pills to show. Defaults to spans only — pass the full list on a
   * screen where a single day is a sensible thing to ask for. */
  presets = SPAN_PRESETS,
  /** Extra params to drop on any change — pagination, mainly, since page 7 of
   * the old window is meaningless in the new one. */
  resetParams = [],
}: {
  period: PeriodKey | null;
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
  presets?: readonly Preset[];
  resetParams?: string[];
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Reverts to the prop automatically once the navigation settles.
  const [shown, showOptimistic] = useOptimistic<Selection>({ period, from, to });

  function push(next: Selection, mutate: (q: URLSearchParams) => void) {
    startTransition(() => {
      showOptimistic(next);
      const q = new URLSearchParams(params.toString());
      mutate(q);
      for (const key of resetParams) q.delete(key);
      const query = q.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function selectPreset(preset: Preset) {
    if (shown.period === preset.key) return;
    // The optimistic dates are unknown until the server resolves the preset;
    // the pill is what moves, and the calendars catch up a beat later.
    push({ period: preset.key, from: shown.from, to: shown.to }, (q) => {
      q.set("period", preset.key);
      q.delete("from");
      q.delete("to");
    });
  }

  function selectDates(nextFrom: string, nextTo: string) {
    // Picking an end past the other swaps them rather than producing an empty
    // range the viewer then has to undo.
    const a = nextFrom <= nextTo ? nextFrom : nextTo;
    const b = nextFrom <= nextTo ? nextTo : nextFrom;
    push({ period: null, from: a, to: b }, (q) => {
      q.set("from", a);
      q.set("to", b);
      q.delete("period");
    });
  }

  return (
    <div
      className="card flex flex-wrap items-center gap-2 px-3.5 py-2.5 transition-opacity"
      role="group"
      aria-label={t("Period")}
      aria-busy={pending}
      // The selection is already painted, so the only thing left to signal is
      // that the numbers below it are still catching up.
      style={{ opacity: pending ? 0.72 : 1 }}
    >
      <span
        className="text-[10.5px] font-bold uppercase"
        style={{ letterSpacing: ".07em", color: "var(--ink-3)" }}
      >
        {t("Period")}
      </span>

      {presets.map((p) => {
        const active = shown.period === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p)}
            aria-pressed={active}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--ink-2)",
              border: `1px solid ${active ? "var(--accent)" : "var(--hairline)"}`,
              cursor: "pointer",
            }}
          >
            {t(p.label)}
          </button>
        );
      })}

      {/* Divider so the calendars read as the escape hatch, not one more pill. */}
      <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--hairline)" }} />

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          aria-label={t("From")}
          className="inp"
          style={{
            width: "auto",
            padding: "5px 8px",
            fontSize: 12,
            // No pill is lit while a custom window is in force, so the inputs
            // themselves have to show they are the active control.
            borderColor: shown.period === null ? "var(--accent)" : undefined,
          }}
          value={shown.from}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && selectDates(e.target.value, shown.to)}
        />
        <span aria-hidden className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          →
        </span>
        <input
          type="date"
          aria-label={t("To")}
          className="inp"
          style={{
            width: "auto",
            padding: "5px 8px",
            fontSize: 12,
            borderColor: shown.period === null ? "var(--accent)" : undefined,
          }}
          value={shown.to}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && selectDates(shown.from, e.target.value)}
        />
      </div>
    </div>
  );
}
