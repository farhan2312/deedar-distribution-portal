export function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="eyebrow">{label}</div>
      <div
        className="mt-1.5 text-[26px] font-bold"
        style={{
          fontFamily: "var(--font-display)",
          color: danger ? "var(--danger)" : "var(--ink-1)",
        }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>{sub}</div>}
    </div>
  );
}
