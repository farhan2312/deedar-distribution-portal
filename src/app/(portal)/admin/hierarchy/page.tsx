import { db } from "@/db";
import { areas, cnfs, counters, depots, states, users } from "@/db/schema";
import { addCnf, addState } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { HierarchyTree, type StateNode } from "./tree";

export default async function AdminHierarchyPage() {
  await requireAdmin();

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
    <div style={{ maxWidth: 820 }}>
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Organisation hierarchy
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
        Central Admin sets up down to C&amp;F HQ; each C&amp;F Manager then adds
        their own depots and areas.
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Headquarters</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
          Kanpur · {allStates.length} state{allStates.length === 1 ? "" : "s"} onboarded
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h6 style={cardTitle}>Add a state</h6>
          <form action={addState}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>State name</label>
              <input className="inp" type="text" name="name" placeholder="e.g. Madhya Pradesh" required />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Country</label>
              <input className="inp" type="text" name="country" defaultValue="India" />
            </div>
            <button className="btn btn-primary" type="submit">Add state</button>
          </form>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h6 style={cardTitle}>Add a C&amp;F HQ</h6>
          {allStates.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Add a state first.</p>
          ) : (
            <form action={addCnfWithState}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>State</label>
                <select className="inp" name="stateId" defaultValue={allStates[0].id}>
                  {allStates.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>C&amp;F HQ name</label>
                <input className="inp" type="text" name="name" placeholder="e.g. BHOPAL CNF HQ" required />
              </div>
              <button className="btn btn-primary" type="submit">Add C&amp;F HQ</button>
            </form>
          )}
        </div>
      </div>

      <HierarchyTree tree={tree} />
    </div>
  );
}

// addCnf is (stateId, formData); adapt to a single-form action reading stateId from the form.
async function addCnfWithState(formData: FormData) {
  "use server";
  const stateId = String(formData.get("stateId") ?? "");
  if (!stateId) return;
  await addCnf(stateId, formData);
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 12px" };
