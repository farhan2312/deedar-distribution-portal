"use client";

import { useState } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useT } from "@/lib/i18n/provider";

export type AreaRow = { area: string; n: number };

const PREVIEW = 5;

/** Small numbered medal — gold/silver/bronze for the top 3, a plain grey
 * circle after that (matches the reference image). */
function MedalBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? "#D4A017" : rank === 2 ? "#9BA3AE" : rank === 3 ? "#B0713A" : null;
  return (
    <span
      className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: medal ?? "var(--bg-soft)", color: medal ? "#fff" : "var(--ink-3)" }}
    >
      {rank}
    </span>
  );
}

/**
 * Full per-area visit ranking. Every area in the depot is included (0 for a
 * day nobody visited it) — collapsed to the top 5 by default, with a
 * "View all areas" toggle that expands the rest in place. Mirrors the
 * expand/collapse pattern already used on the field Day Log history table.
 */
export function AreaLeaderboard({ rows }: { rows: AreaRow[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PREVIEW);
  const max = Math.max(1, ...rows.map((r) => r.n));

  return (
    <div className="flex flex-col gap-2.5">
      {visible.map((a, i) => (
        <div key={a.area} className="flex items-center gap-2.5">
          <MedalBadge rank={i + 1} />
          <div className="w-[92px] truncate text-[12.5px]" style={{ color: "var(--ink-1)" }}>{a.area}</div>
          <div className="flex-1">
            <ProgressBar pct={Math.round((a.n / max) * 100)} height={12} color={i === 0 && a.n > 0 ? "var(--success)" : "var(--accent)"} />
          </div>
          <div className="w-7 text-right text-[12.5px] font-bold tabular-nums" style={{ color: a.n > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
            {a.n}
          </div>
        </div>
      ))}

      {rows.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center justify-center gap-1 border-t pt-3 text-[13px] font-semibold"
          style={{ borderColor: "var(--hairline-soft)", color: "var(--accent)" }}
        >
          {expanded ? t("Show less") : t("View all areas")}
          <ChevronRightIcon className="h-3.5 w-3.5" style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
        </button>
      )}
    </div>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
