"use client";

import { ProgressBar } from "@/components/ui/progress-bar";

export type AreaRow = { area: string; n: number };

/**
 * Rows visible without scrolling. The list holds every area in the depot, so
 * the card is sized to a readable five and the rest scroll inside it — a
 * twenty-area depot must not decide how tall this card is, or it drags the
 * whole analytics row with it.
 */
const VISIBLE_ROWS = 5;
/** Row (medal 20px, bar 12px) plus the flex gap. */
const ROW_HEIGHT = 30;

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
 * day nobody visited it).
 *
 * The whole list is here from the start, scrolling inside a fixed height,
 * rather than a "View all areas" toggle that grew the card and pushed the
 * cards beside it out of line. Scrolling also means the top of the ranking —
 * the part anyone actually came for — stays put while you look down the list.
 */
export function AreaLeaderboard({ rows }: { rows: AreaRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const scrolls = rows.length > VISIBLE_ROWS;

  return (
    <div
      className="flex flex-col gap-2.5"
      style={
        scrolls
          ? {
              // Half a row of the next one stays visible, which is what tells
              // a reader there is more below without a caption saying so.
              maxHeight: ROW_HEIGHT * (VISIBLE_ROWS + 0.5),
              overflowY: "auto",
              // Room for the scrollbar so it never sits on the counts.
              paddingRight: 6,
            }
          : undefined
      }
    >
      {rows.map((a, i) => (
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
    </div>
  );
}
