import { SkeletonStats, SkeletonTable } from "@/app/(portal)/_components/content-loader";

export default function Loading() {
  return (
    <div>
      <SkeletonStats />
      <SkeletonTable />
    </div>
  );
}
