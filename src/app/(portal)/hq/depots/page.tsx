import { redirect } from "next/navigation";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, stockists } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { deleteArea, deleteDepot } from "@/lib/hq/actions";
import { getDeleteImpact } from "@/lib/admin/actions";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { asId } from "@/lib/portal/map-scope";
import { getT } from "@/lib/i18n/server";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { AddAreaForm, AddStockistForm } from "./depot-forms";
import type { StockistKind } from "@/db/schema";
import { Notice } from "@/components/ui/notice";
import { CnfPicker } from "../_components/cnf-picker";

const KIND_LABEL: Record<StockistKind, string> = {
  depot: "Depot",
  dealer: "Dealer",
  sub_dealer: "Sub-Dealer",
};

const KIND_STYLE: Record<StockistKind, { background: string; color: string }> = {
  depot: { background: "rgba(18,138,130,.12)", color: "#0A6660" },
  dealer: { background: "rgba(185,129,46,.14)", color: "#8F611D" },
  sub_dealer: { background: "rgba(185,129,46,.08)", color: "#B9812E" },
};

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
    return <Notice title={t("Stockists & Areas")}>{t("You don't have C&F HQ access.")}</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;

  /*
   * The C&F list, its stockists, their areas and the counters per area — one
   * round trip instead of three.
   *
   * `resolveSelectedCnf` below settles which C&F is shown; the guess here
   * follows its rule (the URL, else the viewer's own, else the first), and the
   * three scoped reads hang off that id through a subquery rather than waiting
   * for the stockist ids to come back. A guess that turns out wrong re-reads
   * below — that is what a stale `?cnf=` costs, not what a normal load costs.
   */
  const guessCnfId = asId(requestedCnfId) ?? user.cnf?.id ?? null;
  const forCnf = (cnfId: string | null) => {
    const owner = cnfId
      ? eq(stockists.cnfId, cnfId)
      : eq(stockists.cnfId, sql`(select id from ${cnfs} order by name asc limit 1)`);
    const scoped = db.select({ id: stockists.id }).from(stockists).where(owner);
    return Promise.all([
      db.select().from(stockists).where(owner).orderBy(asc(stockists.name)),
      db.select().from(areas).where(inArray(areas.stockistId, scoped)).orderBy(asc(areas.name)),
      db.select({ areaId: counters.areaId }).from(counters).where(inArray(counters.stockistId, scoped)),
    ]);
  };

  const [allCnfs, guessed] = await Promise.all([
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    forCnf(guessCnfId),
  ]);
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <Notice title={t("Stockists & Areas")}>{t("No C&F HQ set up yet.")}</Notice>;
  }

  // Which C&F the three reads above actually used — the guess, or the first by
  // name when there was none, which is the same tie-break `resolveSelectedCnf`
  // applies to this very list.
  const queriedCnfId = guessCnfId ?? allCnfs[0]?.id ?? null;
  const [cnfStockists, allAreas, counterRows] =
    queriedCnfId === selectedCnf.id ? guessed : await forCnf(selectedCnf.id);
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
            {t("Add a stockist")}
          </h6>
          <AddStockistForm
            cnfId={selectedCnf.id}
            dealers={cnfStockists.filter((d) => d.kind === "dealer").map((d) => ({ id: d.id, name: d.name }))}
          />
        </div>
        <div className="card p-5">
          <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Add an area")}
          </h6>
          {cnfStockists.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Add a stockist first.")}</p>
          ) : (
            <AddAreaForm
              cnfId={selectedCnf.id}
              stockists={cnfStockists.map((d) => ({ id: d.id, name: d.name }))}
            />
          )}
        </div>
      </div>

      <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Current structure")}
      </h6>
      {cnfStockists.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No stockists yet.")}</p>
      ) : (
        <div className="space-y-2.5">
          {cnfStockists.map((d) => {
            const depotAreas = allAreas.filter((a) => a.stockistId === d.id);
            return (
              <div key={d.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                      {d.name}
                    </span>
                    <span
                      className="chip"
                      style={{ ...KIND_STYLE[d.kind], borderColor: "transparent" }}
                    >
                      {t(KIND_LABEL[d.kind])}
                    </span>
                    {d.parentId && (
                      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {t("under")} {cnfStockists.find((s) => s.id === d.parentId)?.name}
                      </span>
                    )}
                  </div>
                  <ConfirmDelete
                    action={deleteDepot.bind(null, d.id)}
                    itemLabel={t(KIND_LABEL[d.kind]).toLowerCase()}
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
