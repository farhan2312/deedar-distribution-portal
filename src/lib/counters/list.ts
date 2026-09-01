import "server-only";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists } from "@/db/schema";
import { counterTypeLabel } from "@/lib/field/counter-types";
import type { CounterStatus } from "@/lib/khq/reports";

/**
 * One page of a counters list, resolved in SQL.
 *
 * These lists used to fetch up to `MAX_ROWS` (1000 on the ISR's screen, 2000
 * on the SO's, unbounded on the depot's) and let the browser filter and slice
 * them. That put the page's cost on the size of the territory rather than on
 * the size of the page, and it silently truncated at the cap — a counter past
 * row 2000 simply didn't exist as far as the screen was concerned.
 *
 * Now the filters are query params, so the WHERE, the COUNT and the LIMIT all
 * happen in Postgres. A page costs the same whether the stockist holds 50
 * counters or 50,000, the total is honest, and the view is linkable.
 */

/** Rows per page. The client is handed this rather than importing it, so the
 * page size lives in exactly one place. */
export const COUNTERS_PAGE_SIZE = 50;

export type CountersListParams = {
  q?: string;
  area?: string;
  depot?: string;
  page?: string;
};

export type CountersListRow = {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  areaId: string;
  areaName: string;
  stockistId: string;
  stockistName: string;
  status: CounterStatus;
};

export type CountersListPage = {
  rows: CountersListRow[];
  /** Rows matching the filters, across every page. */
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  /** Dropdown options. Queried separately from the rows — deriving them from
   * the page's rows would shrink the filters to whatever page 1 happened to
   * contain. */
  areaOptions: { id: string; name: string }[];
  stockistOptions: { id: string; name: string }[];
  /** What the server actually applied, so the controls can render their own
   * state and a stale id in the URL doesn't leave a filter looking active. */
  filters: { q: string; areaId: string | null; stockistId: string | null };
};

/**
 * @param scopeStockistIds Stockists the viewer may see, or `null` for
 *   unrestricted (Central Admin).
 * @param where Extra always-on predicate — the depot portal passes
 *   wholesale-only, which must survive every filter combination.
 */
export async function fetchCountersList(opts: {
  scopeStockistIds: string[] | null;
  params: CountersListParams;
  where?: SQL;
}): Promise<CountersListPage> {
  const { scopeStockistIds, params, where: extra } = opts;

  const stockistOptions = await db
    .select({ id: stockists.id, name: stockists.name })
    .from(stockists)
    .where(scopeStockistIds ? inArray(stockists.id, scopeStockistIds) : undefined)
    .orderBy(asc(stockists.name));

  // A hand-edited or stale id is dropped rather than honoured, so the filter
  // never silently narrows to something the viewer can't see.
  const stockistId = stockistOptions.some((s) => s.id === params.depot)
    ? (params.depot as string)
    : null;

  const scopeWhere = (): SQL[] => {
    const parts: SQL[] = [];
    if (extra) parts.push(extra);
    if (stockistId) parts.push(eq(counters.stockistId, stockistId));
    else if (scopeStockistIds) parts.push(inArray(counters.stockistId, scopeStockistIds));
    return parts;
  };

  // Areas offered are those that actually hold a counter in the current
  // stockist scope — picking a stockist narrows the area list to that
  // stockist's areas, which is what the client did before.
  const scoped = scopeWhere();
  const areaOptions = await db
    .selectDistinct({ id: areas.id, name: areas.name })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(scoped.length ? and(...scoped) : undefined)
    .orderBy(asc(areas.name));

  const areaId = areaOptions.some((a) => a.id === params.area) ? (params.area as string) : null;

  const q = (params.q ?? "").trim();
  const parts = scopeWhere();
  if (areaId) parts.push(eq(counters.areaId, areaId));
  if (q) {
    const like = `%${q}%`;
    // Name OR mobile — the two things someone types into this box.
    parts.push(or(ilike(counters.name, like), ilike(counters.phone, like))!);
  }
  const filter = parts.length ? and(...parts) : undefined;

  const [{ n: total }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(counters)
    .where(filter);

  const totalPages = Math.max(1, Math.ceil(total / COUNTERS_PAGE_SIZE));
  // Clamped, not rejected: a filter that shrinks the result can leave the URL
  // pointing at page 7 of 3, and an empty table would look like no matches.
  const requested = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const page = Math.min(requested, totalPages);

  const rows = await db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      typeOther: counters.typeOther,
      areaId: counters.areaId,
      areaName: areas.name,
      stockistId: counters.stockistId,
      stockistName: stockists.name,
      status: counters.status,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(filter)
    // The id is a tiebreaker, not decoration: names are not unique (59 counters
    // share one today), and LIMIT/OFFSET over a non-total order lets Postgres
    // return tied rows in a different order per page — which silently drops
    // some rows and repeats others across page boundaries.
    .orderBy(asc(counters.name), asc(counters.id))
    .limit(COUNTERS_PAGE_SIZE)
    .offset((page - 1) * COUNTERS_PAGE_SIZE);

  return {
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      type: counterTypeLabel(c.type, c.typeOther),
      areaId: c.areaId,
      areaName: c.areaName,
      stockistId: c.stockistId,
      stockistName: c.stockistName,
      status: c.status,
    })),
    total,
    page,
    totalPages,
    pageSize: COUNTERS_PAGE_SIZE,
    areaOptions,
    stockistOptions,
    filters: { q, areaId, stockistId },
  };
}
