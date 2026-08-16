"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCounter, type EditCounterInput } from "@/lib/field/actions";
import { ALL_COUNTER_TYPES } from "@/lib/field/counter-types";
import { useT } from "@/lib/i18n/provider";
import { GpsCapture } from "../../../_components/gps-capture";

export function EditCounterForm({
  counterId,
  areaOptions,
  initial,
}: {
  counterId: string;
  areaOptions: { id: string; name: string }[];
  initial: {
    name: string;
    address: string;
    type: EditCounterInput["type"];
    /** Raw manual label from the DB, only set when `type` is "Others". */
    typeOther: string;
    areaId: string;
    gps: string;
  };
}) {
  const router = useRouter();
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Wholesale counters are Supervisor-added only — the field counter form
  // never offers it, for anyone (field rep or admin). If a counter is
  // ALREADY Wholesale (added elsewhere by a Supervisor), it stays visible
  // here so its true type isn't hidden/misrepresented, but it can't be
  // newly selected from this form.
  const counterTypes = initial.type === "Wholesale"
    ? ALL_COUNTER_TYPES
    : ALL_COUNTER_TYPES.filter((t) => t !== "Wholesale");

  async function save() {
    setError("");
    if (!draft.name.trim()) {
      setError(t("Name is required."));
      return;
    }
    if (draft.type === "Others" && !draft.typeOther.trim()) {
      setError(t("Enter the counter type."));
      return;
    }
    setBusy(true);
    const res = await updateCounter(counterId, {
      name: draft.name,
      address: draft.address,
      areaId: draft.areaId,
      type: draft.type,
      typeOther: draft.type === "Others" ? draft.typeOther.trim() : undefined,
      gps: draft.gps,
    });
    if (!res.ok) {
      // Only re-enable on failure — the form stays put and can be retried.
      setBusy(false);
      setError(res.error);
      return;
    }
    // Deliberately stay disabled on success: navigation and the refresh are
    // still in flight, and this component unmounts when the route changes.
    // Clearing `busy` here would flash the button back to "Save changes" while
    // the save was still completing, inviting a double submit.
    router.push(`/field/counter/${counterId}`);
    router.refresh();
  }

  return (
    <div className="card mx-auto max-w-xl p-6" style={{ animation: "fadeUp .3s ease" }}>
      <h1 className="mb-4 text-[22px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {t("Edit counter")}
      </h1>

      <div className="field mb-3.5">
        <label>{t("Name of Counter/Point of Contact *")}</label>
        <input className="inp" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div className="field mb-3.5">
        <label>{t("Address")}</label>
        <input className="inp" type="text" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
      </div>
      <div className="field mb-3.5">
        <label>{t("Area *")}</label>
        <select className="inp" value={draft.areaId} onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}>
          {areaOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="field mb-4">
        <label>{t("Type of Counter *")}</label>
        <div className="flex flex-wrap gap-2">
          {counterTypes.map((ct) => {
            const active = draft.type === ct;
            return (
              <button
                key={ct}
                type="button"
                onClick={() =>
                  setDraft({ ...draft, type: ct, typeOther: ct === "Others" ? draft.typeOther : "" })
                }
                className="chip"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--hairline)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--ink-1)",
                  padding: "9px 16px",
                  fontSize: 13,
                }}
              >
                {t(ct)}
              </button>
            );
          })}
        </div>
        {draft.type === "Others" && (
          <input
            className="inp mt-2.5"
            type="text"
            placeholder={t("Enter counter type, e.g. Medical Store")}
            maxLength={60}
            value={draft.typeOther}
            onChange={(e) => setDraft({ ...draft, typeOther: e.target.value })}
          />
        )}
      </div>
      <div className="mb-5 rounded-2xl p-4" style={{ background: "var(--accent-tint)" }}>
        <label className="mb-2.5 block text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>
          {t("GPS Coordinates")}
        </label>
        <GpsCapture value={draft.gps} onCapture={(gps) => setDraft({ ...draft, gps })} />
      </div>

      {error && <p className="mb-3 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="flex gap-3">
        <button
          className="btn btn-secondary flex-1 justify-center py-3.5"
          onClick={() => router.push(`/field/counter/${counterId}`)}
          disabled={busy}
        >
          {t("Cancel")}
        </button>
        <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={save} disabled={busy}>
          {busy ? t("Saving…") : t("Save changes")}
        </button>
      </div>
    </div>
  );
}
