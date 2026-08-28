import { db } from "@/db";
import { areas, cnfs, counters, stockists, states, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { getT } from "@/lib/i18n/server";
import { AddCnfForm, AddStateForm } from "./hierarchy-forms";
import { HierarchyTree, type StateNode, type StockistNode } from "./tree";

export default async function AdminHierarchyPage() {
  await requireAdmin();
  const t = await getT();

  const [allStates, allCnfs, allStockists, allAreas, allCounters, allUsers] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(stockists),
    db.select().from(areas),
    db.select({ areaId: counters.areaId, stockistId: counters.stockistId }).from(counters),
    db.select({ stockistId: users.stockistId, roles: users.accessRoles }).from(users),
  ]);

  const countersByArea = new Map<string, number>();
  const countersByDepot = new Map<string, number>();
  for (const c of allCounters) {
    countersByArea.set(c.areaId, (countersByArea.get(c.areaId) ?? 0) + 1);
    countersByDepot.set(c.stockistId, (countersByDepot.get(c.stockistId) ?? 0) + 1);
  }
  const repsByDepot = new Map<string, number>();
  for (const u of allUsers) {
    if (u.stockistId && u.roles.includes("field")) {
      repsByDepot.set(u.stockistId, (repsByDepot.get(u.stockistId) ?? 0) + 1);
    }
  }

  // Sub-dealers hang off their dealer rather than sitting beside it, so the
  // tree mirrors the real structure: C&F → depot | dealer → sub-dealer → area.
  const toNode = (d: (typeof allStockists)[number]): StockistNode => ({
    id: d.id,
    name: d.name,
    cnfId: d.cnfId,
    kind: d.kind,
    counters: countersByDepot.get(d.id) ?? 0,
    reps: repsByDepot.get(d.id) ?? 0,
    areas: allAreas
      .filter((a) => a.stockistId === d.id)
      .map((a) => ({ id: a.id, name: a.name, counters: countersByArea.get(a.id) ?? 0 })),
    subDealers: allStockists
      .filter((c) => c.parentId === d.id)
      .map((c) => toNode(c)),
  });

  const tree: StateNode[] = allStates.map((st) => ({
    id: st.id,
    name: st.name,
    country: st.country,
    cnfs: allCnfs
      .filter((c) => c.stateId === st.id)
      .map((cf) => ({
        id: cf.id,
        name: cf.name,
        // Top level is depots and dealers; a sub-dealer appears only inside
        // its parent, never here.
        stockists: allStockists
          .filter((d) => d.cnfId === cf.id && d.parentId === null)
          .map(toNode),
      })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card mb-5 p-4">
        <div className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {t("Headquarters")}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          {t("Kanpur")} · {allStates.length} {t(allStates.length === 1 ? "state" : "states")} {t("onboarded")}
        </div>
      </div>

      <div className="mb-6 grid gap-5 sm:grid-cols-2">
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Add a state")}
          </h6>
          <AddStateForm />
        </div>
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Add a C&F HQ")}
          </h6>
          {allStates.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Add a state first.")}</p>
          ) : (
            <AddCnfForm states={allStates.map((s) => ({ id: s.id, name: s.name }))} />
          )}
        </div>
      </div>

      <HierarchyTree tree={tree} />
    </div>
  );
}
