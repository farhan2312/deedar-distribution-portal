"use client";

import type { DepotCountersData, DepotCounterRow, DepotOption } from "@/lib/depot/data";
import { useT } from "@/lib/i18n/provider";
import { DepotSelect } from "../_components/depot-select";

const STATUS_STYLE: Record<DepotCounterRow["status"], { label: string; bg: string; color: string }> = {
  active: { label: "Active", bg: "rgba(30,158,90,.1)", color: "var(--success)" },
  dormant: { label: "Dormant", bg: "rgba(178,94,0,.1)", color: "var(--warning)" },
  declining: { label: "Declining", bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
};

/**
 * Depot Counters view. Wholesale-only by design — retail outlets are the
 * field reps' territory, not the depot's list to manage. That scoping is
 * enforced server-side in `getDepotCountersData`; the client just renders
 * whatever it's handed.
 */
export function DepotCountersClient({
  depotName,
  scope,
  selectedId,
  data,
}: {
  depotName: string;
  scope: DepotOption[];
  selectedId: string;
  data: DepotCountersData;
}) {
  const t = useT();
  const rows = data.counters;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Wholesale counters")} — {depotName}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("Wholesale outlets served by this depot.")}
          </p>
        </div>
        {scope.length > 1 && <DepotSelect options={scope} value={selectedId} />}
      </div>

      <div className="mb-6 max-w-sm">
        <StatCard
          label={t("Depot counter / bulk sales (today)")}
          value={`${data.bulkSales} ${t("packets")}`}
          hint={t("Bora lifting by wholesale counters")}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Counter", "Type", "Area", "Stock", "Last visit", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-3)" }}>
                  {t("No wholesale counters yet.")}
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const st = STATUS_STYLE[c.status];
                return (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.name}</td>
                    <td>{t(c.type)}</td>
                    <td>{c.area}</td>
                    <td>{c.stock}</td>
                    <td>{c.lastVisitLabel}</td>
                    <td>
                      <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                        {t(st.label)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-5">
      <div className="eyebrow" style={{ fontSize: 11 }}>{label}</div>
      <div className="mt-1 text-[28px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {value}
      </div>
      <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>{hint}</div>
    </div>
  );
}
