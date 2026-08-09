export function ProgressBar({
  pct,
  color = "var(--accent)",
  track = "var(--hairline-soft)",
  height = 6,
}: {
  pct: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-full"
      style={{ height, background: track }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}
