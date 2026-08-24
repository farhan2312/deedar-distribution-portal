import { Skeleton } from "@/app/(portal)/_components/content-loader";

/**
 * Shown the instant a rep row is clicked, while the page's queries run.
 *
 * Deliberately shaped like the real page — back link, name, four summary
 * tiles, then three day cards — rather than a generic block. The layout does
 * not jump when the data lands, so the wait reads as the page filling in
 * rather than one screen being swapped for another.
 */
export default function Loading() {
  return (
    <div>
      {/* Header: back link, rep name, depot line */}
      <div className="mb-5">
        <Skeleton className="h-[13px] w-32 rounded" />
        <Skeleton className="mt-2 h-[26px] w-52 rounded-lg" />
        <Skeleton className="mt-2 h-[14px] w-40 rounded" />
      </div>

      {/* Four window totals */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 flex-none rounded-full" />
              <Skeleton className="h-[12px] w-24 rounded" />
            </div>
            <Skeleton className="mt-2.5 h-[24px] w-16 rounded" />
          </div>
        ))}
      </div>
      <Skeleton className="mb-5 h-[12px] w-48 rounded" />

      {/* One card per day. Only the first carries a visits table — the lower
          two are below the fold on most screens, so filling them with detail
          would animate a lot of pixels nobody is looking at. */}
      <div className="flex flex-col gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <section key={i} className="card overflow-hidden p-0">
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "var(--hairline-soft)" }}
            >
              <div>
                <Skeleton className="h-[16px] w-28 rounded" />
                <Skeleton className="mt-1.5 h-[12px] w-56 rounded" />
              </div>
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-[18px] w-10 rounded" />
                    <Skeleton className="mt-1.5 h-[10px] w-12 rounded" />
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 pt-3">
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            {i === 0 && (
              <>
                <div className="px-5 pt-4">
                  <Skeleton className="h-[11px] w-16 rounded" />
                </div>
                <div className="mt-2 flex flex-col">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div
                      key={j}
                      className="flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                      style={{ borderColor: "var(--hairline-soft)" }}
                    >
                      <Skeleton className="h-[13px] w-14 flex-none rounded" />
                      <Skeleton className="h-[13px] flex-1 rounded" style={{ maxWidth: 180 }} />
                      <Skeleton className="hidden h-[13px] w-20 rounded sm:block" />
                      <Skeleton className="hidden h-[13px] w-10 rounded md:block" />
                      <Skeleton className="hidden h-[13px] w-10 rounded md:block" />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="px-5 py-4">
              <Skeleton className="h-[11px] w-24 rounded" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
