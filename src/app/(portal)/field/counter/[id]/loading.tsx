import { Skeleton, SkeletonCard } from "@/app/(portal)/_components/content-loader";

/**
 * The counter a rep opens from their beat.
 *
 * This is the one that matters most on a phone: the route is dynamic, so
 * without a boundary the tap sat on the beat list with no feedback while the
 * counter and its visit history were fetched — on a field connection, long
 * enough to tap again. The column is `max-w-2xl` like the page itself.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="mb-4 h-[13px] w-28 rounded" />

      {/* The details card: name, type badge, then four detail rows. */}
      <div className="card p-6">
        <Skeleton className="h-[26px] w-56 rounded-lg" />
        <Skeleton className="mt-2.5 h-[24px] w-28 rounded-lg" />
        <div className="mt-5 flex flex-col gap-3 md:max-w-[62%]">
          {[92, 76, 88, 64].map((w) => (
            <Skeleton key={w} className="h-[18px] rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>

      {/* The visit button, then the history below it. */}
      <div className="my-5">
        <Skeleton className="h-[46px] rounded-full" />
      </div>
      <SkeletonCard lines={3} />
    </div>
  );
}
