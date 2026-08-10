"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompetitorPresence, ProductSegment, VisitItem } from "@/db/schema";
import { createVisit, updateVisit, type VisitInput } from "@/lib/field/visit-actions";
import { COMPETITOR_OPTIONS, PRODUCT_SEGMENTS, SEGMENT_LABEL } from "@/lib/field/products";

type ItemDraft = { segment: ProductSegment | ""; stock: string; sold: string };

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

const EMPTY_ITEM: ItemDraft = { segment: "", stock: "", sold: "" };

export function VisitForm({ counterId, counterName, counterArea, visitId, initial }: VisitFormProps) {
  const router = useRouter();
  const isEdit = !!visitId;

  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.length
      ? initial.items.map((i) => ({ segment: i.segment, stock: String(i.stock), sold: String(i.sold) }))
      : [{ ...EMPTY_ITEM }],
  );
  const [rank, setRank] = useState(initial?.rank != null ? String(initial.rank) : "");
  const [competitor, setCompetitor] = useState<CompetitorPresence | null>(initial?.competitor ?? null);
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [step, setStep] = useState<"data" | "review">("data");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function buildInput(): VisitInput {
    return {
      items: items
        .filter((i) => i.segment)
        .map((i) => ({
          segment: i.segment as ProductSegment,
          stock: Number(i.stock) || 0,
          sold: Number(i.sold) || 0,
        })),
      rank: rank ? Number(rank) : null,
      competitor,
      remarks,
    };
  }

  function goReview() {
    setError("");
    const input = buildInput();
    if (input.items.length === 0) {
      setError("Add at least one product with a segment.");
      return;
    }
    if (!rank || Number(rank) < 1) {
      setError("Enter the Deedar rank at this counter.");
      return;
    }
    if (!competitor) {
      setError("Select competitor presence.");
      return;
    }
    setStep("review");
  }

  async function submit() {
    setError("");
    setBusy(true);
    const input = buildInput();
    const res = isEdit ? await updateVisit(visitId, input) : await createVisit(counterId, input);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setStep("data");
      return;
    }
    router.push(`/field/counter/${counterId}`);
    router.refresh();
  }

  const chosen = buildInput();

  return (
    <div className="card mx-auto max-w-xl overflow-hidden" style={{ animation: "fadeUp .3s ease" }}>
      {/* Step bar */}
      <div className="flex gap-2 px-6 pt-5">
        {(["data", "review"] as const).map((s, i) => {
          const done = step === "review" || i === 0;
          const label = s === "data" ? "Visit Data" : "Review";
          const activeHere = step === s;
          return (
            <div key={s} className="flex-1">
              <div className="h-[3px] rounded-full" style={{ background: done ? "var(--accent)" : "var(--hairline)" }} />
              <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: activeHere || done ? "var(--accent)" : "var(--ink-3)" }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 pt-4 pb-6">
        <h1 className="text-[22px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {counterName}
        </h1>
        <p className="mb-4 text-[13px]" style={{ color: "var(--ink-3)" }}>{counterArea}</p>

        {step === "data" ? (
          <>
            <h6 className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
              Products sold
            </h6>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline-soft)" }}>
                  <div className="field mb-3">
                    <label>
                      Product Segment *
                      {items.length > 1 && (
                        <button type="button" className="link link-danger float-right" onClick={() => removeItem(idx)}>
                          Remove
                        </button>
                      )}
                    </label>
                    <select className="inp" value={it.segment} onChange={(e) => updateItem(idx, { segment: e.target.value as ProductSegment })}>
                      <option value="">Select segment</option>
                      {PRODUCT_SEGMENTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field">
                      <label>Stock at Counter *</label>
                      <input className="inp" type="number" min={0} inputMode="numeric" placeholder="Packets" value={it.stock} onChange={(e) => updateItem(idx, { stock: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Packets Sold *</label>
                      <input className="inp" type="number" min={0} inputMode="numeric" placeholder="Packets" value={it.sold} onChange={(e) => updateItem(idx, { sold: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-3 w-full rounded-xl border border-dashed py-3 text-[13.5px] font-semibold"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-tint)" }}
            >
              + Add another product
            </button>

            <div className="field mt-5">
              <label>Deedar Rank at Counter *</label>
              <input className="inp" type="number" min={1} inputMode="numeric" placeholder="e.g. 1 = first" value={rank} onChange={(e) => setRank(e.target.value)} />
            </div>

            <div className="field mt-4">
              <label>Competitor Presence *</label>
              <div className="grid grid-cols-3 gap-2">
                {COMPETITOR_OPTIONS.map((c) => {
                  const active = competitor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCompetitor(c.value)}
                      className="rounded-xl border py-2.5 text-[13px] font-semibold"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--hairline)",
                        background: active ? "var(--accent)" : "#fff",
                        color: active ? "#fff" : "var(--ink-1)",
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field mt-4">
              <label>Remarks (optional)</label>
              <textarea className="inp" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>

            {error && <p className="mt-3 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

            <div className="mt-5 flex gap-3">
              <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => router.push(`/field/counter/${counterId}`)}>
                Back
              </button>
              <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={goReview}>
                Review
              </button>
            </div>
          </>
        ) : (
          <>
            <h6 className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
              Review your visit
            </h6>
            <div className="rounded-2xl p-4" style={{ background: "var(--bg-soft)" }}>
              <div className="space-y-2">
                {chosen.items.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[13px]">
                    <span style={{ color: "var(--ink-1)" }}>{SEGMENT_LABEL[i.segment]}</span>
                    <span style={{ color: "var(--ink-2)" }}>{i.sold} sold · {i.stock} stock</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                <ReviewCell k="Total sold" v={String(chosen.items.reduce((s, i) => s + i.sold, 0))} />
                <ReviewCell k="Deedar rank" v={chosen.rank != null ? `#${chosen.rank}` : "—"} />
                <ReviewCell k="Competitor" v={COMPETITOR_OPTIONS.find((c) => c.value === chosen.competitor)?.label ?? "—"} />
              </div>
              {chosen.remarks && (
                <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>“{chosen.remarks}”</p>
              )}
            </div>

            {error && <p className="mt-3 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

            <div className="mt-5 flex gap-3">
              <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => setStep("data")} disabled={busy}>
                Back
              </button>
              <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={submit} disabled={busy}>
                {busy ? "Saving…" : isEdit ? "Save changes" : "Submit visit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewCell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>{k}</div>
      <div className="mt-0.5 font-semibold" style={{ color: "var(--ink-1)" }}>{v}</div>
    </div>
  );
}
