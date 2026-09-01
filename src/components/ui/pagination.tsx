"use client";

/**
 * Page-number pager, shared by every long list in the app.
 *
 * Extracted from the Reports screen so the counters lists page identically —
 * same control, same wording. Purely presentational: the caller owns where
 * `page` lives, and on every list that is now a URL param, so a page is
 * linkable and survives a reload.
 *
 * Page size is NOT exported from here any more. Each list's server module owns
 * its own constant and hands it down as a prop, because the LIMIT and the
 * rendering have to agree and the SQL is the side that must not import from a
 * client component.
 */

/**
 * Page numbers to render, with `null` for a gap.
 *
 * Up to seven pages are shown in full; beyond that it collapses to
 * first · … · current-1 · current · current+1 · … · last, so the control stays
 * one row wide whether there are 8 pages or 800.
 */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) out.push(null);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push(null);
  out.push(totalPages);
  return out;
}

export function Pagination({
  page,
  totalPages,
  onGo,
  t,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
  t: (k: string) => string;
}) {
  const items = pageWindow(page, totalPages);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onGo(page - 1)}
        disabled={page <= 1}
      >
        {t("Previous")}
      </button>
      {items.map((p, i) =>
        p == null ? (
          <span key={`gap-${i}`} className="px-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onGo(p)}
            aria-current={p === page ? "page" : undefined}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={
              p === page
                ? { background: "var(--accent)", color: "#fff", border: "none" }
                : { background: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--hairline)" }
            }
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onGo(page + 1)}
        disabled={page >= totalPages}
      >
        {t("Next")}
      </button>
    </div>
  );
}
