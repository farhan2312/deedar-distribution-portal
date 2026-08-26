import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pickupBarColor, soldAgainstPickup } from "@/lib/field/day-stock";

export type RepRow = {
  id: string;
  name: string;
  visits: number;
  counters: number;
  /** Packets sold on the day in view. */
  packets: number;
  /** Packets drawn from the depot that morning — the rep's target for the day. */
  pickup: number;
  started: boolean;
  onJob: string | null;
};

/**
 * Packets-sold leaderboard for a Sales Officer's team. Each row links to that
 * rep's detail page for the day in view.
 *
 * The headline reads `sold/picked up` — the pickup recorded on the rep's day
 * log is the stock they took out to sell, so it is the natural denominator: 5
 * of 50 says something 5 on its own does not.
 *
 * No `"use client"`: rows are plain links, so this stays a Server Component
 * and ships no JS. Translation arrives as a `t` prop for the same reason —
 * same arrangement as the shared dashboard kit.
 */
export function RepLeaderboard({
  rows,
  rowsVisible,
  date,
  emptyLabel,
  t,
}: {
  rows: RepRow[];
  /** Rows shown before the list scrolls. */
  rowsVisible: number;
  /** Selected day, forwarded so the rep page opens on the same day. */
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

  // Falls back to the top seller's figure so a team where nobody logged a
  // pickup still gets a comparative bar rather than a row of empty tracks.
  const soldMax = Math.max(1, ...rows.map((r) => r.packets));

  return (
    <div className="overflow-y-auto" style={{ maxHeight: rowsVisible * 76 }}>
      {rows.map((r, i) => {
        const pct = soldAgainstPickup(r.packets, r.pickup);
        return (
          <Link
            key={r.id}
            href={`/supervisor/rep/${r.id}?date=${date}`}
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
                {r.visits} {t("visits")}
                {" · "}
                {r.counters} {t("counters covered")}
                {" · "}
                {r.started ? `${r.onJob} ${t("on job")}` : t("Not started")}
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
