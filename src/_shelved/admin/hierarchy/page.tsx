import { db } from "@/db";
import { areas, cnfs, counters, depots, states } from "@/db/schema";
import {
  addArea,
  addCnf,
  addDepot,
  addState,
  deleteArea,
  deleteCnf,
  deleteDepot,
  deleteState,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { AddInlineForm, DeleteButton } from "../_components/controls";

export default async function AdminHierarchyPage() {
  await requireAdmin();

  const [allStates, allCnfs, allDepots, allAreas, allCounters] = await Promise.all([
    db.select().from(states),
    db.select().from(cnfs),
    db.select().from(depots),
    db.select().from(areas),
    db.select({ areaId: counters.areaId }).from(counters),
  ]);

  const counterCountByArea = new Map<string, number>();
  for (const c of allCounters) {
    counterCountByArea.set(c.areaId, (counterCountByArea.get(c.areaId) ?? 0) + 1);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-[#0d3b2e]">Hierarchy</h1>
      <p className="mt-1 text-sm text-zinc-500">
        State → C&amp;F HQ → Depot → Area — one C&amp;F HQ per state, many
        depots per C&amp;F, many areas per depot.
      </p>

      <div className="mt-6 space-y-4">
        {allStates.map((state) => {
          const stateCnfs = allCnfs.filter((c) => c.stateId === state.id);
          return (
            <div key={state.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[#0d3b2e]">{state.name}</div>
                <DeleteButton action={deleteState.bind(null, state.id)} label={state.name} />
              </div>

              <div className="mt-3 ml-3 space-y-4 border-l border-zinc-100 pl-4">
                {stateCnfs.map((cnf) => {
                  const cnfDepots = allDepots.filter((d) => d.cnfId === cnf.id);
                  return (
                    <div key={cnf.id}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-zinc-800">{cnf.name}</div>
                        <DeleteButton action={deleteCnf.bind(null, cnf.id)} label={cnf.name} />
                      </div>

                      <div className="mt-2 ml-3 space-y-2.5 border-l border-zinc-100 pl-4">
                        {cnfDepots.map((depot) => {
                          const depotAreas = allAreas.filter((a) => a.depotId === depot.id);
                          return (
                            <div key={depot.id}>
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-zinc-700">{depot.name}</div>
                                <DeleteButton
                                  action={deleteDepot.bind(null, depot.id)}
                                  label={depot.name}
                                />
                              </div>
                              <div className="mt-1.5 ml-3 flex flex-wrap items-center gap-1.5">
                                {depotAreas.map((area) => (
                                  <span
                                    key={area.id}
                                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600"
                                  >
                                    {area.name} · {counterCountByArea.get(area.id) ?? 0}
                                    <DeleteButton
                                      action={deleteArea.bind(null, area.id)}
                                      label={area.name}
                                      size="sm"
                                    />
                                  </span>
                                ))}
                                <AddInlineForm
                                  action={addArea.bind(null, depot.id)}
                                  placeholder="New area"
                                />
                              </div>
                            </div>
                          );
                        })}
                        <AddInlineForm
                          action={addDepot.bind(null, cnf.id)}
                          placeholder="New depot"
                        />
                      </div>
                    </div>
                  );
                })}
                <AddInlineForm action={addCnf.bind(null, state.id)} placeholder="New C&F HQ" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Add state
        </div>
        <form action={addState} className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            placeholder="State name"
            required
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0d3b2e]"
          />
          <input
            type="text"
            name="country"
            placeholder="Country (default India)"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0d3b2e]"
          />
          <button
            type="submit"
            className="rounded-md bg-[#0d3b2e] px-4 py-2 text-sm font-semibold text-white"
          >
            Add state
          </button>
        </form>
      </div>
    </div>
  );
}
