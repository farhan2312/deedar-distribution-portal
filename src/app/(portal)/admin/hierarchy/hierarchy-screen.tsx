"use client";

import { useSearchParams } from "next/navigation";
import { HierarchyColumns } from "./columns";
import { HierarchyHeader } from "./hierarchy-header";
import type { HierarchyData } from "./hierarchy-shared";
import { HierarchyTree } from "./tree";
import { isHierarchyView } from "./view";

/**
 * Territory management after the first load: everything happens here, in the
 * browser.
 *
 * The page sends the whole hierarchy once — every state, C&F, stockist and
 * area, with their counts. Which layout is showing and which row is picked
 * change only what is drawn from that payload, never the payload itself, so
 * neither needs the server. Both still live in the URL (`?view=`, `?state=`…)
 * for links and the Back button, written with the native History API, which
 * Next keeps in step with `useSearchParams` without a request.
 *
 * Before this, every click was a server render of the full page: about a
 * second, to re-send the same 44 KB and flash the loading skeleton.
 */
export function HierarchyScreen({ data }: { data: HierarchyData }) {
  const params = useSearchParams();
  const raw = params.get("view") ?? undefined;
  // Columns is the default: it is the one that scales to a big territory
  // without becoming a wall of rows.
  const view = isHierarchyView(raw) ? raw : "columns";

  return (
    <div>
      <HierarchyHeader view={view} />
      {view === "tree" ? <HierarchyTree data={data} /> : <HierarchyColumns data={data} />}
    </div>
  );
}
