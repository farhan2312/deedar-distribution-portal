/**
 * Which layout Territory Management is in. Lives in `?view=`.
 *
 * Deliberately its own module with no `"use client"`: the page is a Server
 * Component and has to *call* `isHierarchyView` to read the param, and a
 * function exported from a client module can only be rendered or passed as a
 * prop, never invoked on the server.
 */

export type HierarchyView = "columns" | "tree";

export function isHierarchyView(v: string | undefined): v is HierarchyView {
  return v === "columns" || v === "tree";
}
