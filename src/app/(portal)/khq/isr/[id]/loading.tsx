import { SkeletonHeader, SkeletonStats, SkeletonTable } from "@/app/(portal)/_components/content-loader";

/** Shown the instant an ISR row is clicked, while the range aggregates run. */
export default function Loading() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonStats count={4} />
      <SkeletonTable rows={8} />
    </div>
  );
}
