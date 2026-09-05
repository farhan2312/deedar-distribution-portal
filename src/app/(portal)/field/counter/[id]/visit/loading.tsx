import { Skeleton } from "@/app/(portal)/_components/content-loader";

/**
 * The visit form — and, being the nearest boundary above it, the edit-a-visit
 * route at `visit/[visitId]` too, which renders the same form with values
 * already in it.
 *
 * A rep opens this standing in front of a shop, so the tap has to acknowledge
 * itself immediately even when the network does not.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="mb-4 h-[13px] w-28 rounded" />
      <div className="card p-6">
        {/* Counter name and its area line, above the form itself. */}
        <Skeleton className="h-[22px] w-52 rounded-lg" />
        <Skeleton className="mt-2 h-[13px] w-40 rounded" />
        <div className="mt-5 flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-[11px] w-28 rounded" />
              <Skeleton className="mt-1.5 h-[42px] rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-[46px] rounded-full" />
      </div>
    </div>
  );
}
