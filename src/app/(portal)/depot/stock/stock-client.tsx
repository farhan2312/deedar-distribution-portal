"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductSegment } from "@/db/schema";
import { PRODUCT_SEGMENTS, SEGMENT_LABEL } from "@/lib/field/products";
import { recordMovement } from "@/lib/depot/actions";
import type { DepotOption, DepotStockData, StockRow } from "@/lib/depot/data";
import { DepotSelect } from "../_components/depot-select";

function levelOf(row: StockRow): { label: string; color: string } {
  if (row.onHand === 0) return { label: "Out of stock", color: "var(--danger)" };
  if (row.onHand < row.lowThreshold) return { label: "Low", color: "var(--warning)" };
  return { label: "In stock", color: "var(--success)" };
}

export function DepotStockClient({
  depot,
  scope,
  data,
}: {
  depot: DepotOption;
  scope: DepotOption[];
  data: DepotStockData;
}) {
  const router = useRouter();
  const [segment, setSegment] = useState<ProductSegment>("DG10");
  const [direction, setDirection] = useState<"inward" | "outward">("inward");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    start(async () => {
      const res = await recordMovement({ depotId: depot.id, segment, direction, qty: n });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQty("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[20px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Depot Stock — {depot.name}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            Daily inward / outward movement, tracked per SKU.
          </p>
        </div>
        {scope.length > 1 && <DepotSelect options={scope} value={depot.id} />}
      </div>

      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total stock at depot" value={`${data.total.toLocaleString("en-IN")} pkts`} />
        <StatCard label="Low-stock SKUs" value={String(data.lowCount)} accent={data.lowCount > 0 ? "var(--warning)" : undefined} />
        <StatCard label="Movements today" value={String(data.movementsToday)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h4 className="mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Stock by SKU
          </h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {["SKU", "Product", "On hand", "Level", "Status"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--ink-3)" }}>No stock recorded for this depot yet.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => {
                    const lvl = levelOf(r);
                    const pct = data.maxOnHand > 0 ? Math.round((r.onHand / data.maxOnHand) * 100) : 0;
                    return (
                      <tr key={r.segment}>
                        <td className="font-semibold">{r.segment}</td>
                        <td style={{ color: "var(--ink-2)" }}>{SEGMENT_LABEL[r.segment]}</td>
                        <td className="font-semibold">{r.onHand}</td>
                        <td style={{ width: "30%" }}>
                          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--hairline)" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: lvl.color }} />
                          </div>
                        </td>
                        <td>
                          <span className="chip" style={{ background: "transparent", color: lvl.color, borderColor: "transparent", padding: 0, fontWeight: 600 }}>
                            {lvl.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {data.recent.length > 0 && (
            <>
              <h4 className="mb-3 mt-7 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                Recent movements
              </h4>
              <div className="space-y-2">
                {data.recent.map((m) => (
                  <div key={m.id} className="card flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className="chip"
                        style={{
                          background: m.direction === "inward" ? "rgba(30,158,90,.1)" : "rgba(178,94,0,.1)",
                          color: m.direction === "inward" ? "var(--success)" : "var(--warning)",
                          borderColor: "transparent",
                        }}
                      >
                        {m.direction === "inward" ? "+ In" : "− Out"}
                      </span>
                      <div>
                        <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
                          {m.segment} · {m.qty} pkts
                        </div>
                        <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {m.note ?? "—"}
                          {m.by ? ` · ${m.by}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{m.whenLabel}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Record a movement */}
        <div className="card p-5">
          <h4 className="mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Record a movement
          </h4>

          <div className="field mb-3">
            <label>SKU</label>
            <select className="inp" value={segment} onChange={(e) => setSegment(e.target.value as ProductSegment)}>
              {PRODUCT_SEGMENTS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="field mb-3">
            <label>Direction</label>
            <div className="flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
              {(["inward", "outward"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className="flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors"
                  style={{
                    background: direction === d ? "var(--accent)" : "transparent",
                    color: direction === d ? "#fff" : "var(--ink-2)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {d === "inward" ? "Inward (received)" : "Outward (lifted)"}
                </button>
              ))}
            </div>
          </div>

          <div className="field mb-4">
            <label>Quantity (packets)</label>
            <input
              className="inp"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 100"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          {error && <p className="mb-3 text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p>}

          <button className="btn btn-primary w-full justify-center" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Record movement"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-5">
      <div className="eyebrow" style={{ fontSize: 11 }}>{label}</div>
      <div className="mt-1 text-[26px] font-bold" style={{ fontFamily: "var(--font-display)", color: accent ?? "var(--ink-1)" }}>
        {value}
      </div>
    </div>
  );
}
