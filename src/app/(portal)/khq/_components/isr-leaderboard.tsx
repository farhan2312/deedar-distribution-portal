import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pickupBarColor, soldAgainstPickup } from "@/lib/field/day-stock";

export type IsrRow = {
  id: string;
  name: string;
  packets: number;
  visits: number;
  counters: number;
  /** Packets drawn from the depot today — the ISR's target for the day. */
  pickup: number;
  started: boolean;
};

/**
 * Packets-sold leaderboard for every ISR in the company view, each row linking
 * to that ISR's full history.
 *
 * Shows TODAY, like the Sales Officer's version — the dashboard's date range
 * scopes the totals and charts, but "who is selling right now" is a live
 * question, not a historical one. Rows read `sold/picked up` against the day
 * log's pickup, exactly as the Sales Officer board does, so the same ISR shows
 * the same number on both screens.
 *
 * Every ISR on the roster gets a row, including ones with nothing today: a
 * quiet ISR is usually the one you want to open, and ranking straight off a
 * visits aggregate hid exactly those.
 *
 * No `"use client"`: rows are plain links, so this stays a Server Component and
 * ships no JS.
 */
export function IsrLeaderboard({
  rows,
  rowsVisible,
  fill,
  date,
  emptyLabel,
  t,
}: {
  rows: IsrRow[];
  /** Rows to show before scrolling. Ignored when `fill` is set. */
  rowsVisible: number;
  /** Stretch to the card's height instead of capping at `rowsVisible`, for a
   * card whose height is set by what sits beside it rather than by its own
   * contents. */
  fill?: boolean;
  /** Day in view, forwarded so the detail page opens on the same date. */
  date: string;
  emptyLabel: string;
  t: (key: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
        {emptyLabel}
      </p>
    );
  }

  // Falls back to the top seller's figure so a roster where nobody logged a
  // pickup still gets a comparative bar rather than a row of empty tracks.
  const soldMax = Math.max(1, ...rows.map((r) => r.packets));

  return (
    <div
      // min-h-0 is what lets a flex child actually shrink and scroll; without
      // it the list grows the card instead of scrolling inside it.
      className={
        fill
          ? // Capped on a narrow screen, where the card is in normal flow and
            // has no row height to inherit; unbounded from lg, where the card
            // is pinned to the row and flex-1 gives the list its height.
            "min-h-0 max-h-[26rem] flex-1 overflow-y-auto lg:max-h-none"
          : "overflow-y-auto"
      }
      style={fill ? undefined : { maxHeight: rowsVisible * 68 }}
    >
      {rows.map((r, i) => {
        const pct = soldAgainstPickup(r.packets, r.pickup);
        return (
        <Link
          key={r.id}
          href={`/khq/isr/${r.id}?date=${date}`}
          className="list-row flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--hairline-soft)" : undefined }}
        >
          <RankBadge rank={i + 1} name={r.name} active={r.packets > 0} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
                {r.name}
              </span>
              <span className="flex-none text-[13px] font-bold tabular-nums" style={{ color: "var(--ink-3)" }}>
                <span style={{ color: r.packets > 0 ? "var(--ink-1)" : "var(--ink-3)" }}>
                  {r.packets.toLocaleString("en-IN")}
                </span>
                <span className="font-medium">/{r.pickup.toLocaleString("en-IN")}</span>
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressBar
                pct={pct ?? Math.round((r.packets / soldMax) * 100)}
                height={7}
                color={pickupBarColor(pct)}
              />
            </div>
            <div className="mt-1.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {pct == null ? t("No pickup logged") : `${pct}% ${t("of pickup sold")}`}
              {" · "}
              {r.visits.toLocaleString("en-IN")} {t("visits")}
              {" · "}
              {r.counters.toLocaleString("en-IN")} {t("counters covered")}
              {" · "}
              {r.started ? t("Started") : t("Not started")}
            </div>
          </div>
          <ChevronIcon />
        </Link>
        );
      })}
    </div>
  );
}

/** Medal for the top three, initial for everyone else. */
function RankBadge({ rank, name, active }: { rank: number; name: string; active: boolean }) {
  const medal = rank <= 3 ? ["#D4A017", "#9AA0A6", "#B87333"][rank - 1] : null;
  return (
    <span
      className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12.5px] font-bold"
      style={{
        background: medal ?? (active ? "var(--accent-tint)" : "var(--bg-soft)"),
        color: medal ? "#fff" : active ? "var(--accent)" : "var(--ink-3)",
      }}
    >
      {medal ? rank : name.charAt(0).toUpperCase()}
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="row-chevron flex-none"
      style={{ color: "var(--ink-3)" }}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
