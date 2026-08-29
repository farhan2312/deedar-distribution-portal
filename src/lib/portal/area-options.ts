import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, stockists } from "@/db/schema";
import type { ScopeOption } from "./map-scope";

/**
 * Area dropdown options for a stockist scope, and the sub-dealer expansion
 * that goes with them.
 *
 * A dealer's areas do not tell the whole story: the areas its sub-dealers own
 * are part of that dealer's territory, and picking "Indergarh" and then
 * finding none of Sawai Madhopur's areas on offer reads as missing data. So a
 * selected dealer is expanded to include its sub-dealers everywhere the scope
 * is used — the option list AND the counter predicate — because listing an
 * area the surrounding filter then excludes would be worse than not listing it.
 *
 * Sub-dealer areas are grouped under their own heading so the list still says
 * who owns what.
 */

/** Add every sub-dealer sitting under any of `ids`. Order is not meaningful. */
export async function withSubDealers(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return ids;
  const children = await db
    .select({ id: stockists.id })
    .from(stockists)
    .where(inArray(stockists.parentId, ids));
  if (children.length === 0) return ids;
  return [...new Set([...ids, ...children.map((c) => c.id)])];
}

/** The sub-dealers under one stockist — empty for a depot or a sub-dealer. */
export async function subDealersOf(stockistId: string): Promise<string[]> {
  const rows = await db
    .select({ id: stockists.id })
    .from(stockists)
    .where(eq(stockists.parentId, stockistId));
  return rows.map((r) => r.id);
}

/**
 * Areas owned by any of `stockistIds`, ready for a `<select>`.
 *
 * Grouped by owning stockist only when more than one contributes — a single
 * stockist's areas need no heading, and adding one would put a redundant label
 * above every option on the common path. Parents sort before their own
 * children, so a dealer's areas come first and each sub-dealer follows under
 * its own heading.
 */
export async function areaOptionsFor(stockistIds: string[]): Promise<ScopeOption[]> {
  if (stockistIds.length === 0) return [];

  const rows = await db
    .select({
      id: areas.id,
      name: areas.name,
      stockistId: areas.stockistId,
      stockistName: stockists.name,
      parentId: stockists.parentId,
    })
    .from(areas)
    .innerJoin(stockists, eq(stockists.id, areas.stockistId))
    .where(inArray(areas.stockistId, stockistIds))
    .orderBy(asc(stockists.name), asc(areas.name));

  const owners = new Set(rows.map((r) => r.stockistId));
  if (owners.size <= 1) {
    // One owner: a flat list, exactly as before sub-dealers existed.
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  // A child sorts inside its parent's block; a stockist whose parent isn't in
  // scope sorts as a root under its own name.
  const nameById = new Map(rows.map((r) => [r.stockistId, r.stockistName]));
  const sortKey = (r: (typeof rows)[number]) => {
    const parentName = r.parentId ? nameById.get(r.parentId) : undefined;
    return [parentName ?? r.stockistName, parentName ? 1 : 0, r.stockistName, r.name] as const;
  };

  return [...rows]
    .sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      for (let i = 0; i < ka.length; i++) {
        const x = ka[i];
        const y = kb[i];
        if (x === y) continue;
        return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      }
      return 0;
    })
    .map((r) => ({ id: r.id, name: r.name, group: r.stockistName }));
}
