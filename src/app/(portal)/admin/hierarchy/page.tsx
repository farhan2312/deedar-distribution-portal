import { db } from "@/db";
import { areas, cnfs, counters, depots, states, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { getT } from "@/lib/i18n/server";
import { AddCnfForm, AddStateForm } from "./hierarchy-forms";
import { HierarchyTree, type StateNode } from "./tree";

export default async function AdminHierarchyPage() {
  await requireAdmin();
  const t = await getT();

  const [allStates, allCnfs, allDepots, allAreas, allCounters, allUsers] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db.select().from(areas),
    db.select({ areaId: counters.areaId, depotId: counters.depotId }).from(counters),
    db.select({ depotId: users.depotId, roles: users.accessRoles }).from(users),
  ]);

  const countersByArea = new Map<string, number>();
  const countersByDepot = new Map<string, number>();
  for (const c of allCounters) {
    countersByArea.set(c.areaId, (countersByArea.get(c.areaId) ?? 0) + 1);
    countersByDepot.set(c.depotId, (countersByDepot.get(c.depotId) ?? 0) + 1);
  }
  const repsByDepot = new Map<string, number>();
  for (const u of allUsers) {
    if (u.depotId && u.roles.includes("field")) {
      repsByDepot.set(u.depotId, (repsByDepot.get(u.depotId) ?? 0) + 1);
    }
  }

  const tree: StateNode[] = allStates.map((st) => ({
    id: st.id,
    name: st.name,
    country: st.country,
    cnfs: allCnfs
      .filter((c) => c.stateId === st.id)
      .map((cf) => ({
        id: cf.id,
        name: cf.name,
        depots: allDepots
          .filter((d) => d.cnfId === cf.id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            counters: countersByDepot.get(d.id) ?? 0,
            reps: repsByDepot.get(d.id) ?? 0,
            areas: allAreas
              .filter((a) => a.depotId === d.id)
              .map((a) => ({ id: a.id, name: a.name, counters: countersByArea.get(a.id) ?? 0 })),
          })),
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
