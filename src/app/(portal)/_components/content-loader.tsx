// Skeleton loading state for the portal's content area, used by the route-level
// `loading.tsx` files. Next swaps the route in immediately on click and renders
// these while the page's server component streams — so navigation happens first,
// then the destination shows its own loading UI (never the old page hanging).
//
// No "use client" — pure markup, so it stays a server component and ships no JS.

/** One shimmering block. `.skeleton` carries the pulse animation (globals.css). */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className ?? ""}`} style={style} />;
}

/** Page title + blurb placeholder, matching the shell's auto page header. */
export function SkeletonHeader() {
  return (
    <div className="mb-6">
      <Skeleton className="h-[26px] w-56 rounded-lg" />
      <Skeleton className="mt-2 h-[14px] w-80 rounded" />
    </div>
  );
}

/** A card-shaped block — the generic stand-in for a panel of content. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-[15px] w-40 rounded" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-[13px] rounded" style={{ width: `${92 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Table placeholder — header strip plus `rows` body rows. */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--hairline-soft)" }}>
        <Skeleton className="h-[13px] w-32 rounded" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
            style={{ borderColor: "var(--hairline-soft)" }}
          >
            <Skeleton className="h-9 w-9 flex-none rounded-full" />
            <Skeleton className="h-[13px] flex-1 rounded" style={{ maxWidth: 200 }} />
            <Skeleton className="hidden h-[13px] w-24 rounded sm:block" />
            <Skeleton className="hidden h-[13px] w-16 rounded md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Row of stat tiles. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-[12px] w-20 rounded" />
          <Skeleton className="mt-2.5 h-[24px] w-14 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Live-map page: narrow roster column beside the map, matching TeamMapView. */
export function SkeletonMap() {
  return (
    <div>
      <Skeleton className="mb-2.5 h-[15px] w-64 rounded" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,240px)_1fr]">
        <Skeleton className="h-[300px] rounded-2xl lg:h-[420px]" />
        <Skeleton className="h-[380px] rounded-2xl lg:h-[420px]" />
      </div>
    </div>
  );
}

/** Form/wizard page: a single centered card. */
export function SkeletonForm() {
  return (
    <div className="mx-auto max-w-xl">
      <SkeletonCard lines={5} />
    </div>
  );
}

/** Default portal page skeleton: header, then a table. */
export function ContentLoader() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonTable />
    </div>
  );
}
