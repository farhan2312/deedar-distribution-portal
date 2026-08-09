export function LegendDot({
  color,
  label,
  square,
}: {
  color: string;
  label: React.ReactNode;
  square?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-2)" }}>
      <span
        className="inline-block h-[9px] w-[9px] flex-none"
        style={{ background: color, borderRadius: square ? 3 : "50%" }}
      />
      {label}
    </span>
  );
}
