"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCounter, type EditCounterInput } from "@/lib/field/actions";
import { GpsCapture } from "../../../_components/gps-capture";

const COUNTER_TYPES: EditCounterInput["type"][] = [
  "Kirana",
  "Paan",
  "Tea Stall",
  "Wholesale",
  "Vegetable Shop",
  "Others",
];

export function EditCounterForm({
  counterId,
  areaOptions,
  initial,
}: {
  counterId: string;
  areaOptions: { id: string; name: string }[];
  initial: { name: string; address: string; type: EditCounterInput["type"]; areaId: string; gps: string };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    const res = await updateCounter(counterId, {
      name: draft.name,
      address: draft.address,
      areaId: draft.areaId,
      type: draft.type,
      gps: draft.gps,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/field/counter/${counterId}`);
    router.refresh();
  }

  return (
    <div className="card mx-auto max-w-xl p-6" style={{ animation: "fadeUp .3s ease" }}>
      <h1 className="mb-4 text-[22px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Edit counter
      </h1>

      <div className="field mb-3.5">
        <label>Name of Counter/Point of Contact *</label>
        <input className="inp" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div className="field mb-3.5">
        <label>Address</label>
        <input className="inp" type="text" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
      </div>
      <div className="field mb-3.5">
        <label>Area *</label>
        <select className="inp" value={draft.areaId} onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}>
          {areaOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="field mb-4">
        <label>Type of Counter *</label>
        <div className="flex flex-wrap gap-2">
          {COUNTER_TYPES.map((t) => {
            const active = draft.type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setDraft({ ...draft, type: t })}
                className="chip"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--hairline)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--ink-1)",
                  padding: "9px 16px",
                  fontSize: 13,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-5 rounded-2xl p-4" style={{ background: "var(--accent-tint)" }}>
        <label className="mb-2.5 block text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>
          GPS Coordinates
        </label>
        <GpsCapture value={draft.gps} onCapture={(gps) => setDraft({ ...draft, gps })} />
      </div>

      {error && <p className="mb-3 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="flex gap-3">
        <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => router.push(`/field/counter/${counterId}`)}>
          Cancel
        </button>
        <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
