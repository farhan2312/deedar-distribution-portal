import { SkeletonHeader, SkeletonMap } from "@/app/(portal)/_components/content-loader";

export default function Loading() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonMap />
    </div>
  );
}
