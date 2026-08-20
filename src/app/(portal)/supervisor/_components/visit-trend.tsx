"use client";

import { useMemo, useState } from "react";

export type TrendPoint = { label: string; value: number };

const W = 520;
const H = 190;
const PAD_L = 34; // room for the y-axis labels
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 26; // room for the x-axis labels

/** "Nice" y-axis top + tick step, so the axis reads 0/5/10/15/20 rather than
 * 0/4.33/8.66. Falls back to a 4-step axis for any magnitude. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

/**
 * Line + area trend with an interactive crosshair: moving the pointer anywhere
 * over the plot snaps to the nearest day and shows a tooltip, matching the
 * reference design. Pointer events (not mouse) so it works on touch too.
 *
 * Generic over what it's plotting — used for both the visits trend and the
 * packets-sold trend, with a different `color` so the two read apart when
 * they sit in the same layout.
 */
export function VisitTrend({
  points,
  unitLabel,
  color = "var(--accent)",
  fill,
}: {
  points: TrendPoint[];
  unitLabel: string;
  /** Line + point stroke colour. */
  color?: string;
  /** Area-fill colour; defaults to a tint derived from `color`. */
  fill?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const areaFill = fill ?? `color-mix(in srgb, ${color} 16%, transparent)`;

  const { top, ticks } = useMemo(
    () => niceScale(Math.max(...points.map((p) => p.value), 0)),
    [points],
  );

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const xy = useMemo(
    () =>
      points.map((p, i) => ({
        x: PAD_L + i * step,
        y: PAD_T + plotH - (top === 0 ? 0 : (p.value / top) * plotH),
      })),
    [points, step, plotH, top],
  );

  if (points.length === 0) return null;

  const linePath = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xy[xy.length - 1].x.toFixed(1)},${PAD_T + plotH} L${xy[0].x.toFixed(1)},${PAD_T + plotH} Z`;

  /** Map a pointer position to the nearest data index. */
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // The SVG scales to its container, so convert client px → viewBox units.
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = step === 0 ? 0 : Math.round((vx - PAD_L) / step);
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const active = hover == null ? null : { pt: points[hover], at: xy[hover] };
  // Flip the tooltip to the left of the cursor near the right edge so it never
  // clips outside the card.
  const tipW = 92;
  const tipX = active
    ? Math.min(Math.max(active.at.x - tipW / 2, 2), W - tipW - 2)
    : 0;
  const tipY = active ? Math.max(active.at.y - 46, 2) : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 200, touchAction: "none" }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
    >
      {/* Horizontal gridlines + y labels */}
      {ticks.map((v) => {
        const y = PAD_T + plotH - (top === 0 ? 0 : (v / top) * plotH);
        return (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y}
              y2={y}
              stroke="var(--hairline-soft)"
              strokeWidth="1"
            />
            <text x={PAD_L - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--ink-3)">
              {v}
            </text>
          </g>
        );
      })}

      {/* Area + line */}
      <path d={areaPath} fill={areaFill} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points — the hovered one grows and fills solid. */}
      {xy.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={hover === i ? 5 : 3.4}
          fill={hover === i ? color : "var(--surface)"}
          stroke={color}
          strokeWidth="2"
        />
      ))}

      {/* X labels */}
      {points.map((p, i) => (
        <text
          key={p.label}
          x={xy[i].x}
          y={H - 8}
          textAnchor="middle"
          fontSize="9.5"
          fill={hover === i ? "var(--ink-1)" : "var(--ink-3)"}
          fontWeight={hover === i ? 700 : 400}
        >
          {p.label}
        </text>
      ))}

      {/* Crosshair + tooltip */}
      {active && (
        <g style={{ pointerEvents: "none" }}>
          <line
            x1={active.at.x}
            x2={active.at.x}
            y1={PAD_T}
            y2={PAD_T + plotH}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
          {/* Fixed dark chip in both themes — `--ink-1` flips to near-white in
              dark mode, which made the white text below invisible. */}
          <rect
            x={tipX}
            y={tipY}
            width={tipW}
            height={38}
            rx="8"
            fill="#1f2233"
            opacity="0.94"
          />
          <text x={tipX + tipW / 2} y={tipY + 15} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.7)">
            {active.pt.label}
          </text>
          <text
            x={tipX + tipW / 2}
            y={tipY + 30}
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#fff"
          >
            {active.pt.value} {unitLabel}
          </text>
        </g>
      )}
    </svg>
  );
}
