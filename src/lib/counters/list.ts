import "server-only";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists } from "@/db/schema";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { asId } from "@/lib/portal/map-scope";
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

  const q = (params.q ?? "").trim();

  /*
   * Options, count and page in ONE round trip.
   *
   * These used to run in a chain — the stockist options, then the areas that
   * the picked stockist narrows, then the count, then the page — four waits on
   * a database ~75 ms away for one table. The ids in the URL are applied
   * straight away (an id-shaped value can be used in SQL before it is known to
   * be on offer), the lists that vet them are read alongside, and the rare
   * stale id is corrected afterwards with a second read.
   */
  const depotGuess = asId(params.depot);
  const areaGuess = asId(params.area);

  const scopeParts = (stockistId: string | null): SQL[] => {
    const parts: SQL[] = [];
    if (extra) parts.push(extra);
    if (stockistId) parts.push(eq(counters.stockistId, stockistId));
    else if (scopeStockistIds) parts.push(inArray(counters.stockistId, scopeStockistIds));
    return parts;
  };
  const filterFor = (stockistId: string | null, areaId: string | null): SQL | undefined => {
    const parts = scopeParts(stockistId);
    if (areaId) parts.push(eq(counters.areaId, areaId));
    if (q) {
      const like = `%${q}%`;
      // Name OR mobile — the two things someone types into this box.
      parts.push(or(ilike(counters.name, like), ilike(counters.phone, like))!);
    }
    return parts.length ? and(...parts) : undefined;
  };
  const countWith = (filter: SQL | undefined) =>
    db.select({ n: sql<number>`count(*)::int` }).from(counters).where(filter);
  const rowsWith = (filter: SQL | undefined, page: number) =>
    db
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
      // The id is a tiebreaker, not decoration: names are not unique (59
      // counters share one today), and LIMIT/OFFSET over a non-total order lets
      // Postgres return tied rows in a different order per page — which
      // silently drops some rows and repeats others across page boundaries.
      .orderBy(asc(counters.name), asc(counters.id))
      .limit(COUNTERS_PAGE_SIZE)
      .offset((page - 1) * COUNTERS_PAGE_SIZE);

  const requested = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const guessFilter = filterFor(depotGuess, areaGuess);
  const scopeAll = scopeParts(null);
  const [stockistOptions, areaRows, guessCount, guessRows] = await Promise.all([
    db
      .select({ id: stockists.id, name: stockists.name })
      .from(stockists)
      .where(scopeStockistIds ? inArray(stockists.id, scopeStockistIds) : undefined)
      .orderBy(asc(stockists.name)),
    // Areas that actually hold a counter in the viewer's scope, each tagged
    // with the stockist whose counter put it there — picking a stockist
    // narrows this list, which is now done in memory rather than in SQL.
    db
      .selectDistinct({ id: areas.id, name: areas.name, stockistId: counters.stockistId })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(scopeAll.length ? and(...scopeAll) : undefined)
      .orderBy(asc(areas.name)),
    countWith(guessFilter),
    rowsWith(guessFilter, requested),
  ]);

  // A hand-edited or stale id is dropped rather than honoured, so the filter
  // never silently narrows to something the viewer can't see.
  const stockistId = stockistOptions.some((s) => s.id === params.depot)
    ? (params.depot as string)
    : null;

  const inStockist = stockistId ? areaRows.filter((a) => a.stockistId === stockistId) : areaRows;
  const seenArea = new Set<string>();
  const areaOptions = inStockist
    .filter((a) => (seenArea.has(a.id) ? false : (seenArea.add(a.id), true)))
    .map((a) => ({ id: a.id, name: a.name }));

  const areaId = areaOptions.some((a) => a.id === params.area) ? (params.area as string) : null;

  // The count and page above were read for the ids as given. When one of them
  // turns out not to be on offer, they are read again for the filter that was
  // actually applied — a stale link's cost, not a normal load's.
  const asGiven = stockistId === depotGuess && areaId === areaGuess;
  const filter = asGiven ? guessFilter : filterFor(stockistId, areaId);
  const [{ n: total }] = asGiven ? guessCount : await countWith(filter);

  const totalPages = Math.max(1, Math.ceil(total / COUNTERS_PAGE_SIZE));
  // Clamped, not rejected: a filter that shrinks the result can leave the URL
  // pointing at page 7 of 3, and an empty table would look like no matches.
  const page = Math.min(requested, totalPages);
  const rows = asGiven && page === requested ? guessRows : await rowsWith(filter, page);

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
