export function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8 text-center">
        {title && (
          <h2 className="text-[20px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {title}
          </h2>
        )}
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {children}
        </p>
      </div>
    </div>
  );
}
