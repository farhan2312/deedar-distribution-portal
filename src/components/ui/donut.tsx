export type DonutSegment = { label: string; value: number; color: string };

/**
 * A donut/ring chart drawn with plain SVG `stroke-dasharray` arcs — no chart
 * library, and no `"use client"`, so it renders on the server like the rest of
 * the dashboards. Theme-aware: the empty-state track uses a token, and every
 * slice colour is passed in (so callers pick role-appropriate colours).
 *
 * Renders nothing chart-specific when `total === 0` — an all-grey ring plus the
 * center label, so an empty month reads as "no data" rather than a broken arc.
 */
export function Donut({
  segments,
  size = 132,
  thickness = 16,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Big number in the middle (e.g. the total, or the leading %). */
  centerValue?: React.ReactNode;
  /** Small caption under the center value. */
  centerLabel?: React.ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  // Running offset so each arc starts where the previous one ended. Rotated so
  // the first slice begins at 12 o'clock, which reads as the natural start.
  let acc = 0;

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        {/* Track — always present so a partially-filled or empty ring still
            reads as a ring. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((seg, i) => {
            if (seg.value <= 0) return null;
            const frac = seg.value / total;
            const dash = frac * circumference;
            const gap = circumference - dash;
            const offset = -acc * circumference;
            acc += frac;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      {(centerValue != null || centerLabel != null) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue != null && (
            <div
              className="text-[19px] font-bold leading-none"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
            >
              {centerValue}
            </div>
          )}
          {centerLabel != null && (
            <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
              {centerLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
