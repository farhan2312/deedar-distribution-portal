"use client";

import { useActionState, useState } from "react";
import type { StockistKind } from "@/db/schema";
import type { HierarchyResult } from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";

/**
 * Pieces shared by the two Territory Management views.
 *
 * Columns and Tree show the same hierarchy with the same colours, counts,
 * badges and add/delete affordances — only the layout differs. Keeping these
 * here means a new level or a renamed kind is a one-file change rather than
 * two views drifting apart.
 */

// ── Data ─────────────────────────────────────────────────────────────────

export type HierarchyData = {
  states: { id: string; name: string; country: string; cnfCount: number }[];
  cnfs: { id: string; name: string; stateId: string; stockistCount: number }[];
  stockists: {
    id: string;
    name: string;
    cnfId: string;
    kind: StockistKind;
    parentId: string | null;
    counters: number;
    reps: number;
    subDealers: number;
    areas: number;
  }[];
  areas: { id: string; name: string; stockistId: string; counters: number }[];
};

export type Selection = {
  state: string | null;
  cnf: string | null;
  stockist: string | null;
  sub: string | null;
};

// ── Palette ──────────────────────────────────────────────────────────────

/** One accent per level, so a column's header, icon and selected row all agree
 * and you can tell depth at a glance without reading the labels. */
export const LEVEL = {
  state: { tint: "#2E9E5A", soft: "rgba(46,158,90,.12)" },
  cnf: { tint: "#2E5FA3", soft: "rgba(46,95,163,.12)" },
  depot: { tint: "#128A82", soft: "rgba(18,138,130,.12)" },
  dealer: { tint: "#B9812E", soft: "rgba(185,129,46,.14)" },
  sub_dealer: { tint: "#8A6FBF", soft: "rgba(138,111,191,.14)" },
  area: { tint: "#7B2FA0", soft: "rgba(123,47,160,.10)" },
} as const;

export const KIND_LABEL: Record<StockistKind, string> = {
  depot: "Depot",
  dealer: "Dealer",
  sub_dealer: "Sub-Dealer",
};

export function stockistMeta(
  d: HierarchyData["stockists"][number],
  t: (k: string) => string,
): string {
  const parts = [
    `${d.counters} ${t(d.counters === 1 ? "counter" : "counters")}`,
    `${d.reps} ${t(d.reps === 1 ? "rep" : "reps")}`,
  ];
  if (d.subDealers > 0) {
    parts.push(`${d.subDealers} ${t(d.subDealers === 1 ? "sub-dealer" : "sub-dealers")}`);
  }
  return parts.join(" · ");
}

export function Legend({ tint, label }: { tint: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
      {label}
    </span>
  );
}

// ── Add ──────────────────────────────────────────────────────────────────

/**
 * Collapsed add control.
 *
 * Opens into a small labelled form rather than sitting open: five always-open
 * inputs across five columns is what made the previous screen hard to read.
 */
export function AddControl({
  action,
  label,
  fields,
  hidden,
  kinds,
  compact,
}: {
  action: (formData: FormData) => Promise<HierarchyResult>;
  label: string;
  fields: { name: string; placeholder: string; defaultValue?: string }[];
  hidden?: Record<string, string>;
  kinds?: { value: string; label: string; hint: string }[];
  /** Tree variant: sits inline among siblings rather than filling a column
   * footer, so it stays left-aligned and loses the dashed full-width box. */
  compact?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kinds?.[0]?.value ?? "");
  const [state, formAction, pending] = useActionState<HierarchyResult | null, FormData>(
    async (_prev, fd) => {
      const res = await action(fd);
      if (res.ok) setOpen(false);
      return res;
    },
    null,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors hover:bg-[var(--bg-soft)]"
            : "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-[12px] font-semibold transition-colors"
        }
        style={compact ? { color: "var(--ink-3)" } : { borderColor: "var(--hairline)", color: "var(--ink-3)" }}
      >
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
          +
        </span>
        {label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      key={state?.ok ? "done" : "editing"}
      className="flex flex-col gap-2"
      style={compact ? { maxWidth: 280 } : undefined}
    >
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} readOnly />
        ))}

      {kinds && (
        <>
          <input type="hidden" name="kind" value={kind} readOnly />
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => {
              const active = kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  disabled={pending}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors"
                  style={{
                    background: active ? "var(--accent)" : "var(--bg-soft)",
                    color: active ? "#fff" : "var(--ink-2)",
                  }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
            {kinds.find((k) => k.value === kind)?.hint}
          </p>
        </>
      )}

      {fields.map((f, i) => (
        <input
          key={f.name}
          className="inp"
          type="text"
          name={f.name}
          placeholder={f.placeholder}
          defaultValue={f.defaultValue}
          required={i === 0}
          autoFocus={i === 0}
          style={{ padding: "6px 9px", fontSize: 12 }}
          disabled={pending}
        />
      ))}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm flex-1 justify-center" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add")}
        </button>
        <button type="button" className="link text-[12px]" onClick={() => setOpen(false)} disabled={pending}>
          {t("Cancel")}
        </button>
      </div>

      {state && !state.ok && (
        <p className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

const ico = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function GlobeIcon() {
  return (
    <svg {...ico}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18Z" />
    </svg>
  );
}
export function BuildingIcon() {
  return (
    <svg {...ico}>
      <path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M15 21V10h3a2 2 0 0 1 2 2v9M4 21h17M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}
export function StoreIcon() {
  return (
    <svg {...ico}>
      <path d="M3 9h18l-1-4H4L3 9ZM5 9v11h14V9M9 20v-6h6v6" />
    </svg>
  );
}
export function UsersIcon() {
  return (
    <svg {...ico}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M18 20a5 5 0 0 0-2-4" />
    </svg>
  );
}
export function PinIcon() {
  return (
    <svg {...ico}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
export function ChevronIcon() {
  return (
    <svg {...ico} width="14" height="14" style={{ color: "var(--ink-3)", flex: "none" }}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Disclosure triangle for the tree — rotates instead of swapping glyphs, so
 * the transition reads as the same control opening. */
export function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      {...ico}
      width="13"
      height="13"
      style={{
        color: "var(--ink-3)",
        flex: "none",
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform .15s ease",
      }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
