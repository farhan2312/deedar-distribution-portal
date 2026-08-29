import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, states, stockists, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { HierarchyColumns, type HierarchyData } from "./columns";

/**
 * Territory management as Miller columns: State → C&F → Stockist → Sub-Dealer
 * → Areas, each column listing the children of the selection to its left.
 *
 * Every count is aggregated in SQL. The previous version pulled every counter
 * row (688 and climbing) purely to length-count them in JS, which is a page
 * load that grows with the business for a number that does not.
 */
export default async function AdminHierarchyPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; cnf?: string; stockist?: string; sub?: string }>;
}) {
  await requireAdmin();
  const sel = await searchParams;

  const [
    allStates,
    allCnfs,
    allStockists,
    allAreas,
    countersByArea,
    countersByStockist,
    repsByStockist,
  ] = await Promise.all([
    db.select().from(states).orderBy(asc(states.name)),
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    db.select().from(stockists).orderBy(asc(stockists.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
    db
      .select({ areaId: counters.areaId, n: sql<number>`count(*)::int` })
      .from(counters)
      .groupBy(counters.areaId),
    db
      .select({ stockistId: counters.stockistId, n: sql<number>`count(*)::int` })
      .from(counters)
      .groupBy(counters.stockistId),
    db
      .select({ stockistId: users.stockistId, n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`'field' = ANY(${users.accessRoles}::text[]) and ${users.stockistId} is not null`)
      .groupBy(users.stockistId),
  ]);

  const areaCount = new Map(countersByArea.map((r) => [r.areaId, r.n]));
  const stockistCounters = new Map(countersByStockist.map((r) => [r.stockistId, r.n]));
  const stockistReps = new Map(repsByStockist.map((r) => [r.stockistId!, r.n]));

  const data: HierarchyData = {
    states: allStates.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      cnfCount: allCnfs.filter((c) => c.stateId === s.id).length,
    })),
    cnfs: allCnfs.map((c) => ({
      id: c.id,
      name: c.name,
      stateId: c.stateId,
      // Top-level only: a sub-dealer belongs to its dealer, not to the C&F list.
      stockistCount: allStockists.filter((d) => d.cnfId === c.id && d.parentId === null).length,
    })),
    stockists: allStockists.map((d) => ({
      id: d.id,
      name: d.name,
      cnfId: d.cnfId,
      kind: d.kind,
      parentId: d.parentId,
      counters: stockistCounters.get(d.id) ?? 0,
      reps: stockistReps.get(d.id) ?? 0,
      subDealers: allStockists.filter((x) => x.parentId === d.id).length,
      areas: allAreas.filter((a) => a.stockistId === d.id).length,
    })),
    areas: allAreas.map((a) => ({
      id: a.id,
      name: a.name,
      stockistId: a.stockistId,
      counters: areaCount.get(a.id) ?? 0,
    })),
  };

  return (
    <HierarchyColumns
      data={data}
      selection={{
        state: sel.state ?? null,
        cnf: sel.cnf ?? null,
        stockist: sel.stockist ?? null,
        sub: sel.sub ?? null,
      }}
    />
  );
}
