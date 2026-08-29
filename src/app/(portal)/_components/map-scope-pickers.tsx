"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ScopeLevel, ScopeOption } from "@/lib/portal/map-scope";

type LevelKey = ScopeLevel["key"];

/**
 * The C&F → Depot → Area filter row shared by all three live maps and the
 * Reports screen. Which levels appear is decided by the resolver from the
 * viewer's role — Central Admin gets all three on every map, an SO gets Depot
 * + Area, an ISR gets just Area — and the picker just renders what it's
 * handed. A level with no options renders disabled rather than vanishing, so
 * the same viewer always sees the same set of filters.
 *
 * Selection lives in the query string, so the server re-resolves the scope
 * and the page is linkable/back-button friendly. Picking a level clears the
 * levels below it — a depot from the previous C&F, or an area from the
 * previous depot, is meaningless in the new scope.
 *
 * Selecting is optimistic. `value` is the server's answer, which only arrives
 * once the whole page has re-rendered against the new scope, so painting the
 * selects from it made every choice visibly snap back to the old one first.
 * `useOptimistic` shows the new selection on the same frame as the change and
 * defers back to the server's value when the transition settles, so a scope
 * the server rejects or re-resolves still ends up displayed correctly.
 */
export function MapScopePickers({ levels }: { levels: ScopeLevel[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Reverts to the server's values automatically once navigation settles.
  const [shown, showOptimistic] = useOptimistic<Partial<Record<LevelKey, string>>>(
    Object.fromEntries(levels.map((l) => [l.key, l.value])),
  );

  if (levels.length === 0) return null;

  /** Set one level and clear everything below it, preserving other params. */
  function select(key: LevelKey, next: string) {
    startTransition(() => {
      // The cleared children have to move too. Their option lists are still
      // the previous scope's until the server answers, but "all" is present at
      // every level, so it is always a valid thing to show in the meantime.
      const optimistic: Partial<Record<LevelKey, string>> = { ...shown, [key]: next };
      if (key === "cnf") optimistic.depot = "all";
      if (key !== "area") optimistic.area = "all";
      showOptimistic(optimistic);

      const q = new URLSearchParams(params.toString());
      q.set(key, next);
      if (key === "cnf") q.delete("depot");
      if (key !== "area") q.delete("area");
      router.push(`${pathname}?${q.toString()}`);
    });
  }

  return (
    <>
      {levels.map((l) => (
        <select
          key={l.key}
          className="inp transition-opacity"
          style={{
            width: "auto",
            padding: "6px 10px",
            fontSize: 12,
            // The choice is already painted; this only says the results below
            // are still catching up.
            opacity: pending ? 0.72 : 1,
          }}
          value={shown[l.key] ?? l.value}
          onChange={(e) => select(l.key, e.target.value)}
          aria-label={l.label}
          // No options = nothing to filter on; keep the control visible so the
          // set of filters is stable, but don't let the viewer interact with it.
          disabled={l.options.length === 0}
        >
          <option value="all">{l.allLabel}</option>
          {renderOptions(l.options)}
        </select>
      ))}
    </>
  );
}

/**
 * Options, wrapped in an `<optgroup>` wherever they carry a heading.
 *
 * The list arrives pre-sorted so each group's options are already contiguous;
 * this only has to notice where the heading changes. Ungrouped options render
 * bare, which is every option on a dropdown that has a single owner.
 */
function renderOptions(options: ScopeOption[]) {
  const blocks: { group: string | null; options: ScopeOption[] }[] = [];
  for (const o of options) {
    const group = o.group ?? null;
    const last = blocks[blocks.length - 1];
    if (last && last.group === group) last.options.push(o);
    else blocks.push({ group, options: [o] });
  }

  return blocks.map((b, i) => {
    const body = b.options.map((o) => (
      <option key={o.id} value={o.id}>
        {o.name}
      </option>
    ));
    // Index in the key: two sibling stockists can share a name, and a bare
    // block has no name at all.
    return b.group == null ? (
      body
    ) : (
      <optgroup key={`${b.group}-${i}`} label={b.group}>
        {body}
      </optgroup>
    );
  });
}
