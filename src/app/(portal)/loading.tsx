import { ContentLoader } from "./_components/content-loader";

// Shown instantly on navigation to ANY portal page while its server component
// streams in — for the first load of a section and for cross-section hops. The
// shell adds a matching client-side loader for same-section hops, where this
// route-level boundary is reused and doesn't re-show. Both use ContentLoader so
// the loading state looks identical however it was triggered.
export default function PortalLoading() {
  return <ContentLoader />;
}
