"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ScopeLevel } from "@/lib/portal/map-scope";

/**
 * The C&F → Depot → Area filter row shared by all three live maps. Which
 * levels appear is decided by the resolver from the viewer's role — Central
 * Admin gets all three on every map, an SO gets Depot + Area, an ISR gets
 * just Area — and the picker just renders what it's handed. A level with no
 * options renders disabled rather than vanishing, so the same viewer always
 * sees the same set of filters.
 *
 * Selection lives in the query string, so the server re-resolves the scope
 * and the page is linkable/back-button friendly. Picking a level clears the
 * levels below it — a depot from the previous C&F, or an area from the
 * previous depot, is meaningless in the new scope.
 */
export function MapScopePickers({ levels }: { levels: ScopeLevel[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (levels.length === 0) return null;

  /** Set one level and clear everything below it, preserving other params. */
  function select(key: ScopeLevel["key"], next: string) {
    const q = new URLSearchParams(params.toString());
    q.set(key, next);
    if (key === "cnf") q.delete("depot");
    if (key !== "area") q.delete("area");
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <>
      {levels.map((l) => (
        <select
          key={l.key}
          className="inp"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          value={l.value}
          onChange={(e) => select(l.key, e.target.value)}
          aria-label={l.label}
          // No options = nothing to filter on; keep the control visible so the
          // set of filters is stable, but don't let the viewer interact with it.
          disabled={l.options.length === 0}
        >
          <option value="all">{l.allLabel}</option>
          {l.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}
