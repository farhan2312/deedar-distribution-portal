"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompetitorPresence, ProductSegment, VisitItem } from "@/db/schema";
import { createVisit, updateVisit, type VisitInput } from "@/lib/field/visit-actions";
import { COMPETITOR_OPTIONS, MAX_SOLD_PER_SKU, PRODUCT_SEGMENTS, SEGMENT_LABEL } from "@/lib/field/products";

const SEGMENTS: ProductSegment[] = PRODUCT_SEGMENTS.map((p) => p.value);
type SegMap = Record<ProductSegment, number>;

export type VisitFormProps = {
  counterId: string;
  counterName: string;
  counterArea: string;
  visitId?: string;
  initial?: {
    items: VisitItem[];
    rank: number | null;
    competitor: CompetitorPresence | null;
    remarks: string;
  };
};

function zeroMap(): SegMap {
  return { DG10: 0, DG20: 0, DB20: 0, DB40: 0 };
}
function initMap(items: VisitItem[] | undefined, key: "sold" | "stock"): SegMap {
  const m = zeroMap();
  for (const it of items ?? []) if (it.segment in m) m[it.segment] = it[key];
  return m;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const RANK_OPTIONS = [1, 2, 3, null] as const;

export function VisitForm({ counterId, counterName, counterArea, visitId, initial }: VisitFormProps) {
  const router = useRouter();
  const isEdit = !!visitId;

  const [sold, setSold] = useState<SegMap>(() => initMap(initial?.items, "sold"));
  const [stock, setStock] = useState<SegMap>(() => initMap(initial?.items, "stock"));
  const [rank, setRank] = useState<number | null>(initial?.rank ?? 1);
  const [competitor, setCompetitor] = useState<CompetitorPresence>(initial?.competitor ?? "none");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Live "time on counter" — counts up from when the check-in form opened.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isEdit) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isEdit]);

  const totalSold = SEGMENTS.reduce((s, seg) => s + sold[seg], 0);
  // Cap is per SKU, not combined — flag if any single segment is at its limit.
  const anyAtCap = SEGMENTS.some((seg) => sold[seg] >= MAX_SOLD_PER_SKU);

  function bumpSold(seg: ProductSegment, delta: number) {
    // Each segment is independently capped at MAX_SOLD_PER_SKU.
    setSold((prev) => ({
      ...prev,
      [seg]: Math.min(MAX_SOLD_PER_SKU, Math.max(0, prev[seg] + delta)),
    }));
  }
  function setStockValue(seg: ProductSegment, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw)) || 0);
    setStock((prev) => ({ ...prev, [seg]: n }));
  }

  function buildInput(): VisitInput {
    return {
      items: SEGMENTS.map((seg) => ({ segment: seg, stock: stock[seg], sold: sold[seg] })),
      rank,
      competitor,
      remarks,
      durationSeconds: isEdit ? null : elapsed,
    };
  }

  async function submit() {
    setError("");
    setBusy(true);
    const input = buildInput();
    const res = isEdit ? await updateVisit(visitId, input) : await createVisit(counterId, input);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/field/counter/${counterId}`);
    router.refresh();
  }

  return (
    <div className="card mx-auto max-w-xl overflow-hidden" style={{ animation: "fadeUp .3s ease" }}>
      <div className="px-6 pb-6 pt-6">
        {!isEdit && (
          <div
            className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
            style={{ background: "rgba(30,158,90,.1)", color: "var(--success)" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)", animation: "pulseDot 1.4s ease-in-out infinite" }} />
            Location verified · checked in
          </div>
        )}

        {/* Counter header + timer */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: "var(--bg-soft)" }}>
          <div className="min-w-0">
            <h3 className="truncate text-[19px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {counterName}
            </h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>{counterArea}</p>
          </div>
          {!isEdit && (
            <div className="flex-none text-right">
              <div className="text-[28px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", letterSpacing: "-.02em", color: "var(--ink-1)" }}>
                {mmss(elapsed)}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>time on counter</div>
            </div>
          )}
        </div>

        <p className="mb-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
          4 quick questions — under 30 seconds.
        </p>
        <div className="mb-4 h-px" style={{ background: "var(--hairline)" }} />

        <div className="mb-1 flex items-baseline justify-between">
          <h6 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
            Packets sold &amp; stock at counter
          </h6>
          <span className="text-[11px] font-semibold" style={{ color: "var(--ink-3)" }}>
            {totalSold} sold
          </span>
        </div>

        <div>
          {SEGMENTS.map((seg) => (
            <div key={seg} className="flex flex-wrap items-center justify-between gap-2 py-3" style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
              <span className="text-[14px] font-medium" style={{ color: "var(--ink-1)" }}>{SEGMENT_LABEL[seg]}</span>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>Sold</span>
                <Stepper
                  value={sold[seg]}
                  onDec={() => bumpSold(seg, -1)}
                  onInc={() => bumpSold(seg, 1)}
                  incDisabled={sold[seg] >= MAX_SOLD_PER_SKU}
                />
                <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>Stock</span>
                <input
                  className="inp text-center"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  style={{ width: 64, padding: "8px 6px" }}
                  value={stock[seg]}
                  onChange={(e) => setStockValue(seg, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        {anyAtCap && (
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--warning)" }}>
            Max {MAX_SOLD_PER_SKU} packets sold per SKU.
          </p>
        )}

        <div className="my-4 h-px" style={{ background: "var(--hairline)" }} />

        <h6 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>Our rank at this counter</h6>
        <Segmented
          options={RANK_OPTIONS.map((r) => ({ value: r === null ? "na" : String(r), label: r === null ? "N/A" : String(r) }))}
          value={rank === null ? "na" : String(rank)}
          onChange={(v) => setRank(v === "na" ? null : Number(v))}
        />

        <h6 className="mb-2 mt-4 text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>Competitor presence</h6>
        <Segmented
          options={COMPETITOR_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
          value={competitor}
          onChange={(v) => setCompetitor(v as CompetitorPresence)}
        />

        <h6 className="mb-2 mt-4 text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>Remarks (optional)</h6>
        <textarea
          className="inp"
          rows={2}
          placeholder="e.g. asked for bigger visi-cooler"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />

        {error && <p className="mt-3 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="mt-5 flex gap-3">
          <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => router.push(`/field/counter/${counterId}`)} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Submit visit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  value,
  onDec,
  onInc,
  incDisabled,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  incDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <StepBtn label="−" onClick={onDec} disabled={value === 0} />
      <span className="min-w-[22px] text-center text-[15px] font-semibold tabular-nums" style={{ color: "var(--ink-1)" }}>{value}</span>
      <StepBtn label="+" onClick={onInc} disabled={incDisabled} />
    </div>
  );
}

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[18px] font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
    >
      {label}
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-xl p-[3px]" style={{ background: "var(--bg-soft)" }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--ink-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
