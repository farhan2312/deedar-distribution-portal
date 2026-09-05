import { Skeleton } from "@/app/(portal)/_components/content-loader";

/**
 * Edit counter — a form, so the skeleton is a form: label-and-field pairs
 * rather than the generic card, which would flash a different shape than the
 * one that replaces it.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="mb-4 h-[13px] w-28 rounded" />
      <div className="card p-6">
        <Skeleton className="h-[20px] w-44 rounded" />
        <div className="mt-5 flex flex-col gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="h-[11px] w-24 rounded" />
              <Skeleton className="mt-1.5 h-[42px] rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-[46px] rounded-full" />
      </div>
    </div>
  );
}
