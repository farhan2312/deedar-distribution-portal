"use client";

import type { DepotCountersData, DepotCounterRow, StockistOption } from "@/lib/depot/data";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { Pagination } from "@/components/ui/pagination";
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
 *
 * `data.counters` is one page, paged in SQL. It used to be every wholesale
 * counter at the stockist with no LIMIT at all, sliced in the browser.
 */
export function DepotCountersClient({
  stockistName,
  scope,
  selectedId,
  data,
}: {
  stockistName: string;
  scope: StockistOption[];
  selectedId: string;
  data: DepotCountersData;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const { counters: rows, total, page, totalPages, pageSize } = data;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  function goToPage(next: number) {
    startTransition(() => {
      const q = new URLSearchParams(params.toString());
      if (next <= 1) q.delete("page");
      else q.set("page", String(next));
      const query = q.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div>
      {/* Title and description live in the top bar; this row carries only what
          the shell can't know — which stockist, and how far down the list. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
          <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
            {stockistName}
          </span>
          {total > pageSize && (
            <span>
              {firstRow}–{lastRow} {t("of")} {total}
            </span>
          )}
        </div>
        {scope.length > 1 && <DepotSelect options={scope} value={selectedId} />}
      </div>

      <div className="mb-6 max-w-sm">
        <StatCard
          label={t("Stockist counter / bulk sales (today)")}
          value={`${data.bulkSales} ${t("packets")}`}
          hint={t("Bora lifting by wholesale counters")}
        />
      </div>

      {/* Dimmed while the next page is in flight. */}
      <div className="table-wrap transition-opacity" style={{ opacity: pending ? 0.6 : 1 }}>
        <table className="table">
          <thead>
            <tr>
              {["Counter", "Type", "Area", "Stock", "Last visit", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
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

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onGo={goToPage} t={t} />
      )}
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
