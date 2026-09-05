import { Skeleton, SkeletonCard, SkeletonStats } from "@/app/(portal)/_components/content-loader";

/**
 * Shown the instant the sidebar link is clicked.
 *
 * Without a boundary of its own, a hop from another admin page had nothing
 * closer than the one at the portal root — and React keeps the page you are
 * leaving on screen until the new one is ready, so the click appeared to do
 * nothing while the log's queries ran. Every other admin section already has
 * one; this was the gap.
 *
 * The shape mirrors the real screen — four KPI cards, the tab strip, the
 * period pills, then the charts — so the layout does not jump when the data
 * lands.
 */
export default function Loading() {
  return (
    <div>
      <SkeletonStats />

      {/* Tabs, then the period pills under them. */}
      <div className="mb-3 flex gap-5 border-b pb-2.5" style={{ borderColor: "var(--hairline-soft)" }}>
        {[64, 88, 116, 62, 128].map((w) => (
          <Skeleton key={w} className="h-[15px] rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        {[58, 66, 72, 44].map((w) => (
          <Skeleton key={w} className="h-[30px] rounded-full" style={{ width: w }} />
        ))}
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1fr_minmax(272px,330px)]">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_minmax(272px,330px)]">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
