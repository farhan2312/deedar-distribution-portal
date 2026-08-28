"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductSegment, StockMovementType } from "@/db/schema";
import { PRODUCT_SEGMENTS, SEGMENT_LABEL } from "@/lib/field/products";
import { closeStockDay, recordMovement } from "@/lib/depot/actions";
import type { StockistOption, DepotStockData, StockRow } from "@/lib/depot/data";
import { useT } from "@/lib/i18n/provider";
import { DepotSelect } from "../_components/depot-select";

const SEGMENTS: ProductSegment[] = PRODUCT_SEGMENTS.map((p) => p.value);

// English strings below are DICTIONARY KEYS — translated at render, not here.
const MOVEMENT_TYPES: { value: StockMovementType; label: string }[] = [
  { value: "inward", label: "Inward from C&F" },
  { value: "outward_retail", label: "Outward — Retail counters" },
  { value: "outward_wholesale", label: "Outward — Wholesale counters" },
  { value: "returns", label: "Returns / damage" },
  { value: "manual", label: "Manual adjustment" },
];

// Log column uses the shorter labels; both variants live in the dictionary.
const TYPE_LABEL: Record<StockMovementType, string> = {
  inward: "Inward from C&F",
  outward_retail: "Outward — Retail",
  outward_wholesale: "Outward — Wholesale",
  returns: "Returns / damage",
  manual: "Manual adjustment",
};

/** Two states, matching the prototype: below threshold is "Low stock". */
function levelOf(row: StockRow) {
  return row.onHand < row.lowThreshold
    ? { label: "Low stock", color: "var(--danger)", bg: "rgba(199,38,59,.1)" }
    : { label: "Healthy", color: "var(--success)", bg: "rgba(30,158,90,.12)" };
}

export function DepotStockClient({
  depot,
  scope,
  data,
}: {
  depot: StockistOption;
  scope: StockistOption[];
  data: DepotStockData;
}) {
  const router = useRouter();
  const t = useT();
  const [type, setType] = useState<StockMovementType>("inward");
  const [segment, setSegment] = useState<ProductSegment>("DG10");
  const [repUserId, setRepUserId] = useState("");
  const [wholesaleCounterId, setWholesaleCounterId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const locked = data.todayClosed;
  const isOutwardRetail = type === "outward_retail";
  const isOutwardWholesale = type === "outward_wholesale";
  const isManual = type === "manual";

  function submit() {
    setError(null);
    const n = Math.trunc(Number(qty));
    if (!Number.isFinite(n) || n === 0) {
      setError(t("Enter a quantity."));
      return;
    }
    start(async () => {
      const res = await recordMovement({
        stockistId: depot.id,
        segment,
        type,
        qty: n,
        note,
        repUserId: isOutwardRetail ? repUserId : null,
        wholesaleCounterId: isOutwardWholesale ? wholesaleCounterId : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQty("");
      setNote("");
      setRepUserId("");
      setWholesaleCounterId("");
      router.refresh();
    });
  }

  function closeDay() {
    setError(null);
    start(async () => {
      const res = await closeStockDay(depot.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[20px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Stock")}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("Daily inward / outward movement, tracked per SKU.")}
          </p>
        </div>
        {scope.length > 1 && <DepotSelect options={scope} value={depot.id} />}
      </div>

      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("Total stock")} value={`${data.total.toLocaleString("en-IN")} ${t("pkts")}`} />
        <StatCard label={t("Low-stock SKUs")} value={String(data.lowCount)} accent={data.lowCount > 0 ? "var(--warning)" : undefined} />
        <StatCard label={t("Movements today")} value={String(data.movementsToday)} />
      </div>

      {/* Stock by SKU */}
      <h4 className="mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Stock by SKU")}
      </h4>
      <div className="table-wrap mb-7">
        <table className="table">
          <thead>
            <tr>
              {["SKU", "Product", "On hand", "Level", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-3)" }}>{t("No stock recorded for this stockist yet.")}</td>
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
                    <td style={{ width: "30%", minWidth: 160 }}>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--hairline)" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: lvl.color }} />
                      </div>
                    </td>
                    <td>
                      <span className="chip" style={{ background: lvl.bg, color: lvl.color, borderColor: "transparent" }}>
                        {t(lvl.label)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Record a movement */}
      <div className="card mb-7 max-w-xl p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h6 className="text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Record a stock movement")}
          </h6>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "7px 12px" }}
            onClick={closeDay}
            disabled={locked || pending}
          >
            {t("Close today's stock")}
          </button>
        </div>

        <div
          className="mb-3.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
          style={
            locked
              ? { background: "rgba(30,158,90,.12)", color: "var(--success)" }
              : { background: "var(--bg-soft)", color: "var(--ink-2)" }
          }
        >
          {locked
            ? `${t("Closed by")} ${data.todayClosedBy ?? "—"} · ${data.todayClosedAtLabel ?? ""} ${t("— no further edits today.")}`
            : t("Open for today — record movements as they happen.")}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field">
            <label>{t("Movement type")}</label>
            <select className="inp" value={type} disabled={locked} onChange={(e) => setType(e.target.value as StockMovementType)}>
              {MOVEMENT_TYPES.map((m) => (
                <option key={m.value} value={m.value}>{t(m.label)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("SKU")}</label>
            <select className="inp" value={segment} disabled={locked} onChange={(e) => setSegment(e.target.value as ProductSegment)}>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {isOutwardRetail && (
          <div className="field mb-3">
            <label>{t("Field Salesman ISR *")}</label>
            <select className="inp" value={repUserId} disabled={locked} onChange={(e) => setRepUserId(e.target.value)}>
              <option value="">{t("Select salesman")}</option>
              {data.reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {isOutwardWholesale && (
          <div className="field mb-3">
            <label>{t("Wholesale counter *")}</label>
            <select className="inp" value={wholesaleCounterId} disabled={locked} onChange={(e) => setWholesaleCounterId(e.target.value)}>
              <option value="">{t("Select wholesale counter")}</option>
              {data.wholesaleCounters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <div className="field">
            <label>{isManual ? t("Quantity (+/−)") : t("Quantity")}</label>
            <input
              className="inp"
              type="number"
              inputMode="numeric"
              placeholder={isManual ? t("e.g. -20") : t("e.g. 50")}
              value={qty}
              disabled={locked}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("Note")}</label>
            <input
              className="inp"
              type="text"
              placeholder={t("e.g. Truck no. / counter name / reason")}
              value={note}
              disabled={locked}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mb-3 text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p>}

        <button className="btn btn-primary" onClick={submit} disabled={locked || pending}>
          {pending ? t("Saving…") : t("Record movement")}
        </button>
      </div>

      {/* Daily movement log */}
      <h4 className="mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Daily movement log")}
      </h4>
      <div className="table-wrap mb-7">
        <table className="table">
          <thead>
            <tr>
              {["Date", "SKU", "Type", "Qty", "To / by", "Note", "Logged by"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.movements.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--ink-3)" }}>{t("No movements recorded yet.")}</td>
              </tr>
            ) : (
              data.movements.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{m.whenLabel}</td>
                  <td className="font-semibold">{m.segment}</td>
                  <td className="whitespace-nowrap">{t(TYPE_LABEL[m.type])}</td>
                  <td
                    className="font-semibold tabular-nums"
                    style={{ color: m.qty < 0 ? "var(--danger)" : "var(--success)" }}
                  >
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td style={{ color: "var(--accent)" }}>{m.toLabel ?? "—"}</td>
                  <td style={{ color: "var(--ink-2)" }}>{m.note ?? "—"}</td>
                  <td style={{ color: "var(--ink-2)" }}>{m.by ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Historic closing balance */}
      <h4 className="mb-1 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Historic stock (daily closing balance)")}
      </h4>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        {t("Logged automatically at each movement — kept for trend analysis.")}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Date", ...SEGMENTS, "Total", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.history.length === 0 ? (
              <tr>
                <td colSpan={SEGMENTS.length + 3} style={{ color: "var(--ink-3)" }}>
                  {t("No closing balances yet — record a movement to start the log.")}
                </td>
              </tr>
            ) : (
              data.history.map((h) => (
                <tr key={h.date}>
                  <td className="whitespace-nowrap">{h.dateLabel}</td>
                  {SEGMENTS.map((s) => (
                    <td key={s}>{h.closing[s] ?? 0}</td>
                  ))}
                  <td className="font-semibold">{h.total}</td>
                  <td className="whitespace-nowrap">
                    {h.closed ? (
                      <span className="chip" style={{ background: "rgba(30,158,90,.12)", color: "var(--success)", borderColor: "transparent" }}>
                        {t("Closed by")} {h.closedBy ?? "—"} · {h.closedAtLabel ?? ""}
                      </span>
                    ) : (
                      <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}>
                        {t("Open")}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
