import { SkeletonHeader, SkeletonTable } from "@/app/(portal)/_components/content-loader";

export default function Loading() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonTable />
    </div>
  );
}
