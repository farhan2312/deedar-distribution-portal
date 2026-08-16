import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { deleteArea, deleteDepot } from "@/lib/hq/actions";
import { getDeleteImpact } from "@/lib/admin/actions";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { getT } from "@/lib/i18n/server";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { AddAreaForm, AddDepotForm } from "./depot-forms";
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
  const t = await getT();
  if (!user.accessRoles.includes("hq") && !isAdmin) {
    return <Notice title={t("Depots & Areas")}>{t("You don't have C&F HQ access.")}</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs).orderBy(asc(cnfs.name));
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <Notice title={t("Depots & Areas")}>{t("No C&F HQ set up yet.")}</Notice>;
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
            <label className="text-[12px]">{t("C&F HQ")}</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>

      <div className="mb-7 grid gap-5 sm:grid-cols-2">
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Add a depot")}
          </h6>
          <AddDepotForm cnfId={selectedCnf.id} />
        </div>
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Add an area")}
          </h6>
          {cnfDepots.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Add a depot first.")}</p>
          ) : (
            <AddAreaForm
              cnfId={selectedCnf.id}
              depots={cnfDepots.map((d) => ({ id: d.id, name: d.name }))}
            />
          )}
        </div>
      </div>

      <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Current structure")}
      </h6>
      {cnfDepots.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No depots yet.")}</p>
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
                  <ConfirmDelete
                    action={deleteDepot.bind(null, d.id)}
                    itemLabel="depot"
                    itemName={d.name}
                    loadImpact={getDeleteImpact.bind(null, "depot", d.id)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {depotAreas.map((a) => (
                    <span key={a.id} className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent", paddingRight: 6 }}>
                      {a.name} · {counterCountByArea.get(a.id) ?? 0}
                      <ConfirmDelete
                        action={deleteArea.bind(null, a.id)}
                        itemLabel="area"
                        itemName={a.name}
                        loadImpact={getDeleteImpact.bind(null, "area", a.id)}
                        trigger="x"
                      />
                    </span>
                  ))}
                  {depotAreas.length === 0 && (
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("No areas yet")}</span>
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
