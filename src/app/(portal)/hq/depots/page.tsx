import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { addArea, addDepot, deleteArea, deleteDepot } from "@/lib/hq/actions";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { Notice } from "@/components/ui/notice";
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
    return <Notice title="Depots & Areas">You don&apos;t have C&amp;F HQ access.</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs).orderBy(asc(cnfs.name));
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <Notice title="Depots & Areas">No C&amp;F HQ set up yet.</Notice>;
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        {/* Page title comes from the shell; this carries the C&F in scope. */}
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {selectedCnf.name}
        </h4>
        {isAdmin && allCnfs.length > 1 && (
          <>
            <span className="flex-1" />
            <label className="text-[12px]">C&amp;F HQ</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>

      <div className="mb-7 grid gap-5 sm:grid-cols-2">
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Add a depot
          </h6>
          <form action={addDepot.bind(null, selectedCnf.id)}>
            <div className="field mb-3.5">
              <label>Depot name</label>
              <input className="inp" type="text" name="name" placeholder="e.g. Ramganj Mandi Depot" required />
            </div>
            <button className="btn btn-primary" type="submit">Add depot</button>
          </form>
        </div>
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Add an area
          </h6>
          {cnfDepots.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Add a depot first.</p>
          ) : (
            <form action={addArea.bind(null, selectedCnf.id)}>
              <div className="field mb-3">
                <label>Depot</label>
                <select className="inp" name="depotId" defaultValue={cnfDepots[0].id}>
                  {cnfDepots.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="field mb-3.5">
                <label>Area name</label>
                <input className="inp" type="text" name="name" placeholder="e.g. Ramganj Town" required />
              </div>
              <button className="btn btn-primary" type="submit">Add area</button>
            </form>
          )}
        </div>
      </div>

      <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Current structure
      </h6>
      {cnfDepots.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No depots yet.</p>
      ) : (
        <div className="space-y-2.5">
          {cnfDepots.map((d) => {
            const depotAreas = allAreas.filter((a) => a.depotId === d.id);
            return (
              <div key={d.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                    {d.name}
                  </div>
                  <form action={deleteDepot.bind(null, d.id)}>
                    <button className="link link-danger" type="submit">Delete</button>
                  </form>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {depotAreas.map((a) => (
                    <span key={a.id} className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent", paddingRight: 6 }}>
                      {a.name} · {counterCountByArea.get(a.id) ?? 0}
                      <form action={deleteArea.bind(null, a.id)} className="inline">
                        <button
                          type="submit"
                          aria-label="Delete area"
                          className="ml-1 border-0 bg-transparent px-0.5 leading-none"
                          style={{ color: "var(--ink-3)", fontSize: 13 }}
                        >
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                  {depotAreas.length === 0 && (
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>No areas yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
