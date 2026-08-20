import { Donut, type DonutSegment } from "@/components/ui/donut";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * Shared presentational kit for the analytics dashboards (C&F HQ, Kanpur HQ,
 * Sales Officer).
 *
 * Deliberately server-compatible — no `"use client"`, no hooks — so the
 * dashboards can stay Server Components. Translation is passed in as a `t`
 * prop rather than read from the client provider, for the same reason.
 *
 * Lives here rather than in each page so the three dashboards can't drift
 * apart visually again.
 */

export const cardTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 14,
  margin: 0,
  color: "var(--ink-1)",
};

export const cardSub: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-3)",
  margin: "0 0 12px",
};

export type Delta = { pct: number | null; isNew: boolean };

/** Period-over-period delta. `pct === null` means there's no prior baseline to
 * divide by; `isNew` separates "0 → something" from "0 → 0". */
export function computeDelta(cur: number, prev: number): Delta {
  if (prev === 0) return { pct: null, isNew: cur > 0 };
  return { pct: Math.round(((cur - prev) / prev) * 100), isNew: false };
}

// ── KPI tile ───────────────────────────────────────────────────────────────

export type KpiProps = {
  icon: IconName;
  tint: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Colours the `sub` caption when there's no delta pill to show. */
  tone?: "warn" | "bad";
  delta?: Delta;
  deltaLabel?: string;
};

/** Tinted icon square, label, big number, then either a delta pill or a
 * plain caption. */
export function Kpi({
  icon,
  tint,
  label,
  value,
  sub,
  tone,
  delta,
  deltaLabel,
  t,
}: KpiProps & { t: (k: string) => string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2.5">
        <IconTile name={icon} tint={tint} size={32} />
        <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
          {label}
        </span>
      </div>
      <div
        className="mt-2.5 text-[24px] font-bold leading-none"
        style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
      {delta && (
        <div className="mt-2">
          <DeltaPill d={delta} label={deltaLabel} t={t} />
        </div>
      )}
      {!delta && tone && (
        <div className="mt-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              background: tone === "warn" ? "rgba(224,161,0,.14)" : "rgba(199,38,59,.1)",
              color: tone === "warn" ? "var(--warning)" : "var(--danger)",
            }}
          >
            {tone === "warn" ? "!" : "▲"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Green/red "▲ 12%" pill with a muted caption. */
export function DeltaPill({
  d,
  label,
  t,
}: {
  d: Delta;
  label?: string;
  t: (k: string) => string;
}) {
  if (d.pct === null) {
    return (
      <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        — {d.isNew ? t("new") : t("no change")}
      </span>
    );
  }
  const up = d.pct >= 0;
  const color = up ? "var(--success)" : "var(--danger)";
  const bg = up ? "rgba(30,158,90,.12)" : "rgba(199,38,59,.1)";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
        style={{ background: bg, color }}
      >
        {up ? "▲" : "▼"} {Math.abs(d.pct)}%
      </span>
      {label && (
        <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
          {label}
        </span>
      )}
    </span>
  );
}

// ── Card header ────────────────────────────────────────────────────────────

/** Standard card header: tinted icon tile + title + subtitle, with optional
 * right-hand slot (a count chip, a "back" link, a peak-value readout). */
export function CardHead({
  icon,
  tint,
  title,
  sub,
  right,
}: {
  icon: IconName;
  tint: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <IconTile name={icon} tint={tint} />
        <div className="min-w-0">
          <h6 style={cardTitle}>{title}</h6>
          {sub && (
            <p className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

// ── Donut card ─────────────────────────────────────────────────────────────

export function DonutCard({
  icon,
  tint,
  title,
  sub,
  segments,
  total,
  centerValue,
  centerLabel,
  empty,
  translateLabels,
  t,
}: {
  icon: IconName;
  tint: string;
  title: string;
  sub: string;
  segments: DonutSegment[];
  total: number;
  centerValue: React.ReactNode;
  centerLabel: React.ReactNode;
  empty?: string;
  /** Run each legend label through `t()` — for label sets that are English
   * dictionary keys (counter types, stock bands) rather than SKU codes. */
  translateLabels?: boolean;
  t: (k: string) => string;
}) {
  return (
    <section className="card flex flex-col p-5">
      <CardHead icon={icon} tint={tint} title={title} sub={sub} />
      {empty ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          {empty}
        </p>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-4">
          <Donut segments={segments} size={116} centerValue={centerValue} centerLabel={centerLabel} />
          <div className="flex max-h-[124px] flex-col gap-2 overflow-y-auto pr-1">
            {segments.map((s) => (
              <StatusRow
                key={s.label}
                color={s.color}
                label={translateLabels ? t(s.label) : s.label}
                n={s.value}
                total={total}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Legend row: colour swatch, label, count, percentage. */
export function StatusRow({
  color,
  label,
  n,
  total,
}: {
  color: string;
  label: string;
  n: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      <span className="flex-none font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>
        {n}
      </span>
      <span className="w-9 flex-none text-right tabular-nums" style={{ color: "var(--ink-3)" }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export type BoardRow = {
  key: string;
  name: string;
  /** Right-aligned headline number, pre-formatted. */
  value: string;
  /** Bar fill, 0-100. */
  pct: number;
  /** Optional caption under the bar. */
  meta?: React.ReactNode;
};

/** Ranked list with medal badges and bars, scrolling past `visibleRows`. */
export function ScrollBoard({
  icon,
  tint,
  title,
  sub,
  rows,
  empty,
  visibleRows = 5,
}: {
  icon: IconName;
  tint: string;
  title: string;
  sub: string;
  rows: BoardRow[];
  empty: string;
  visibleRows?: number;
}) {
  return (
    <section className="card flex flex-col overflow-hidden p-0">
      <div
        className="flex flex-none items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--hairline-soft)" }}
      >
        <div className="flex items-center gap-3">
          <IconTile name={icon} tint={tint} />
          <div>
            <h6 style={cardTitle}>{title}</h6>
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              {sub}
            </p>
          </div>
        </div>
        {rows.length > visibleRows && (
          <span
            className="chip flex-none"
            style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}
          >
            {rows.length}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {empty}
        </p>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: visibleRows * 68 }}>
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--hairline-soft)" : undefined }}
            >
              <MedalBadge rank={i + 1} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>
                    {r.name}
                  </span>
                  <span
                    className="flex-none text-[12.5px] font-bold tabular-nums"
                    style={{ color: "var(--ink-1)" }}
                  >
                    {r.value}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar pct={r.pct} height={7} color={i === 0 ? "var(--success)" : "var(--accent)"} />
                </div>
                {r.meta && (
                  <div className="mt-1.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {r.meta}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Gold/silver/bronze for the top 3, plain grey after that. */
export function MedalBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? "#D4A017" : rank === 2 ? "#9BA3AE" : rank === 3 ? "#B0713A" : null;
  return (
    <span
      className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10.5px] font-bold"
      style={{ background: medal ?? "var(--bg-soft)", color: medal ? "#fff" : "var(--ink-3)" }}
    >
      {rank}
    </span>
  );
}

// ── Highlights ─────────────────────────────────────────────────────────────

export type HighlightTone = "good" | "warn" | "bad";
export type Highlight = { tone: HighlightTone; icon: IconName; text: string };

/** Tinted alert rows — the "what needs your attention" card body. */
export function HighlightList({ items }: { items: Highlight[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((h, i) => {
        const c =
          h.tone === "good" ? "var(--success)" : h.tone === "warn" ? "var(--warning)" : "var(--danger)";
        const bg =
          h.tone === "good"
            ? "rgba(30,158,90,.08)"
            : h.tone === "warn"
              ? "rgba(224,161,0,.1)"
              : "rgba(199,38,59,.08)";
        return (
          <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: bg }}>
            <span
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full"
              style={{ background: c, color: "#fff" }}
            >
              <Icon name={h.icon} className="h-4 w-4" />
            </span>
            <span className="text-[12.5px] font-medium" style={{ color: "var(--ink-1)" }}>
              {h.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

/** Rounded tinted square holding an icon — the card-header motif. */
export function IconTile({ name, tint, size = 36 }: { name: IconName; tint: string; size?: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-xl"
      style={{
        height: size,
        width: size,
        background: `color-mix(in srgb, ${tint} 14%, transparent)`,
        color: tint,
      }}
    >
      <Icon name={name} className={size >= 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

export type IconName =
  | "users" | "route" | "store" | "grid" | "clock" | "alert" | "check"
  | "trendUp" | "trendDown" | "trophy" | "box" | "pieChart" | "star"
  | "rupee" | "pin" | "heart" | "building" | "swords" | "userOff" | "globe";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", ...stroke };
  switch (name) {
    case "users":
      return (
        <svg {...p}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "route":
      return (
        <svg {...p}>
          <circle cx="6" cy="19" r="3" />
          <circle cx="18" cy="5" r="3" />
          <path d="M9 19h5a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5" />
        </svg>
      );
    case "store":
      return (
        <svg {...p}>
          <path d="M3 9V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4M3 9h18M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
          <path d="M9 13h6" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "alert":
      return (
        <svg {...p}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "trendUp":
      return (
        <svg {...p}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      );
    case "trendDown":
      return (
        <svg {...p}>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M17 17h4v-4" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M8 21h8M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
        </svg>
      );
    case "box":
      return (
        <svg {...p}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "pieChart":
      return (
        <svg {...p}>
          <path d="M21.2 15.3A10 10 0 1 1 8.7 2.8" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
    case "star":
      return (
        <svg {...p}>
          <path d="m12 3 2.6 5.6 6 .8-4.4 4.1 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
        </svg>
      );
    case "rupee":
      return (
        <svg {...p}>
          <path d="M6 4h12M6 9h12M6 4c6 0 8 1.5 8 4.5S12 13 6 13l9 7" />
        </svg>
      );
    case "pin":
      return (
        <svg {...p}>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p}>
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1Z" />
        </svg>
      );
    case "building":
      return (
        <svg {...p}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4" />
        </svg>
      );
    case "swords":
      return (
        <svg {...p}>
          <path d="M14.5 14.5 21 21M3 3l7 7M3 8V3h5l11 11-5 5L3 8Z" />
        </svg>
      );
    case "userOff":
      return (
        <svg {...p}>
          <path d="M18 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10.5" cy="7" r="4" />
          <path d="m17 3 5 5M22 3l-5 5" />
        </svg>
      );
    case "globe":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
        </svg>
      );
  }
}
