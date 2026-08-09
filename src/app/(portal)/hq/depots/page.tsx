import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { addArea, addDepot, deleteArea, deleteDepot } from "@/lib/hq/actions";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { CnfPicker } from "../_components/cnf-picker";

export default async function HqDepotsPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.accessRoles.includes("admin");
  if (!user.accessRoles.includes("hq") && !isAdmin) {
    return <p style={{ fontSize: 14, color: "var(--ink-2)" }}>You don&apos;t have C&amp;F HQ access.</p>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs).orderBy(asc(cnfs.name));
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <p style={{ fontSize: 14, color: "var(--ink-2)" }}>No C&amp;F HQ set up yet.</p>;
  }

  const cnfDepots = await db
    .select()
    .from(depots)
    .where(eq(depots.cnfId, selectedCnf.id))
    .orderBy(asc(depots.name));
  const depotIds = cnfDepots.map((d) => d.id);
  const [allAreas, counterRows] = await Promise.all([
    depotIds.length ? db.select().from(areas).where(inArray(areas.depotId, depotIds)).orderBy(asc(areas.name)) : Promise.resolve([]),
    depotIds.length ? db.select({ areaId: counters.areaId }).from(counters).where(inArray(counters.depotId, depotIds)) : Promise.resolve([]),
  ]);
  const counterCountByArea = new Map<string, number>();
  for (const c of counterRows) counterCountByArea.set(c.areaId, (counterCountByArea.get(c.areaId) ?? 0) + 1);

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: 0 }}>
          Depots &amp; Areas — {selectedCnf.name}
        </h4>
        {isAdmin && allCnfs.length > 1 && (
          <>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 12 }}>C&amp;F HQ</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>
        Central Admin sets up states and C&amp;F HQs; from here you add the
        depots and areas under a C&amp;F.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20 }}>
          <h6 style={cardTitle}>Add a depot</h6>
          <form action={addDepot.bind(null, selectedCnf.id)}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Depot name</label>
              <input className="inp" type="text" name="name" placeholder="e.g. Ramganj Mandi Depot" required />
            </div>
            <button className="btn btn-primary" type="submit">Add depot</button>
          </form>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h6 style={cardTitle}>Add an area</h6>
          {cnfDepots.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Add a depot first.</p>
          ) : (
            <form action={addArea.bind(null, selectedCnf.id)}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Depot</label>
                <select className="inp" name="depotId" defaultValue={cnfDepots[0].id}>
                  {cnfDepots.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Area name</label>
                <input className="inp" type="text" name="name" placeholder="e.g. Ramganj Town" required />
              </div>
              <button className="btn btn-primary" type="submit">Add area</button>
            </form>
          )}
        </div>
      </div>

      <h6 style={{ ...cardTitle, marginBottom: 12 }}>Current structure</h6>
      {cnfDepots.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No depots yet.</p>
      ) : (
        cnfDepots.map((d) => {
          const depotAreas = allAreas.filter((a) => a.depotId === d.id);
          return (
            <div key={d.id} className="card" style={{ padding: 16, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                <form action={deleteDepot.bind(null, d.id)}>
                  <button className="link" style={{ fontSize: 12, color: "var(--danger)" }} type="submit">Delete</button>
                </form>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {depotAreas.map((a) => (
                  <span key={a.id} style={pillStyle}>
                    {a.name} · {counterCountByArea.get(a.id) ?? 0}
                    <form action={deleteArea.bind(null, a.id)} style={{ display: "inline" }}>
                      <button
                        type="submit"
                        aria-label="Delete area"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 13, lineHeight: 1, padding: "0 2px" }}
                      >
                        ×
                      </button>
                    </form>
                  </span>
                ))}
                {depotAreas.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>No areas yet</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 12px" };
const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 6px 4px 10px",
  borderRadius: "var(--r-pill)",
  background: "var(--bg-soft)",
  color: "var(--ink-2)",
};
