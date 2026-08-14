import { SkeletonHeader, SkeletonForm } from "@/app/(portal)/_components/content-loader";

export default function Loading() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonForm />
    </div>
  );
}
