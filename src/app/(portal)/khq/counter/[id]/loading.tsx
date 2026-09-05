import { Skeleton, SkeletonCard, SkeletonTable } from "@/app/(portal)/_components/content-loader";

/**
 * Shown the moment a counter row in Reports is clicked.
 *
 * A dynamic route with no boundary of its own is not prefetched at all and
 * cannot navigate until the server answers, so the click looked like it had
 * missed. This mirrors the real page — back link and title, the two detail
 * cards, then the visits table — so nothing shifts when the data lands.
 */
export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-[13px] w-32 rounded" />
      <Skeleton className="h-[26px] w-64 rounded-lg" />
      <Skeleton className="mt-2 mb-5 h-[14px] w-80 rounded" />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>

      <SkeletonTable rows={8} />
    </div>
  );
}
