"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkDuplicate,
  createCounter,
  type NewCounterInput,
} from "@/lib/field/actions";
import {
  checkDuplicateForSupervisor,
  createCounterBySupervisor,
} from "@/lib/supervisor/actions";
import { GpsCapture } from "../_components/gps-capture";

export type AreaOption = { id: string; name: string };
export type DepotOption = { id: string; name: string; cnfId: string; areas: AreaOption[] };
export type CnfOption = { id: string; name: string };

/** "field" (default) uses field actions and returns to the beat; "supervisor"
 * uses SO actions and returns to Assign Beat so the new counter can be handed
 * out right away. */
export type WizardVariant = "field" | "supervisor";

type WizardMode =
  | { mode: "locked"; depot: { id: string; name: string }; cnf: { name: string }; areas: AreaOption[] }
  | { mode: "open"; cnfs: CnfOption[]; depots: DepotOption[] };

type WizardProps = WizardMode & { variant?: WizardVariant };

const ALL_COUNTER_TYPES: NewCounterInput["type"][] = ["Kirana", "Paan", "Tea Stall", "Wholesale", "Vegetable Shop", "Others"];

type Step = "duplicate" | "details" | "review";

export function NewCounterWizard(props: WizardProps) {
  const router = useRouter();
  const isSupervisor = props.variant === "supervisor";
  const backHref = isSupervisor ? "/supervisor/assign-beat" : "/field/beat";
  const doneHref = isSupervisor ? "/supervisor/assign-beat" : "/field/beat";
  // Wholesale counters are Supervisor-added only — the field counter form
  // (used by field reps AND admin alike) never offers it. Only the
  // Supervisor variant of this wizard does.
  const counterTypes: NewCounterInput["type"][] = isSupervisor
    ? ALL_COUNTER_TYPES
    : ALL_COUNTER_TYPES.filter((t) => t !== "Wholesale");
  const [step, setStep] = useState<Step>("duplicate");
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    address: "",
    cnfId: "",
    depotId: props.mode === "locked" ? props.depot.id : "",
    areaId: "",
    type: "" as NewCounterInput["type"] | "",
    gps: "",
  });
  // A phone is a counter's unique id, so a match means the outlet already
  // exists — a field rep is then routed to add a visit (id + canVisit set),
  // while a supervisor just sees it's taken.
  const [dup, setDup] = useState<
    { name: string; type: string; area: string; id?: string; depotName?: string; canVisit?: boolean } | null
  >(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Reactive duplicate check: as soon as the phone hits 10 digits, look it up
  // (debounced) and surface the match automatically. Anything shorter is
  // cleared from the onChange handler. All state writes here live inside the
  // async callback — react-hooks/set-state-in-effect disallows syncing state
  // in the effect body.
  useEffect(() => {
    if (step !== "duplicate" || !/^\d{10}$/.test(draft.phone)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const match = isSupervisor
        ? await checkDuplicateForSupervisor(draft.phone)
        : await checkDuplicate(draft.phone);
      if (cancelled) return;
      setDup(match);
      setChecking(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.phone, step, isSupervisor]);

  const steps: { key: Step; label: string }[] = [
    { key: "duplicate", label: "Check Duplicate" },
    { key: "details", label: "Counter Details" },
    { key: "review", label: "Review" },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);

  // Resolve display + option lists depending on locked vs open mode.
  const cnfName = props.mode === "locked" ? props.cnf.name : props.cnfs.find((c) => c.id === draft.cnfId)?.name ?? "";
  const depotName = props.mode === "locked" ? props.depot.name : props.depots.find((d) => d.id === draft.depotId)?.name ?? "";
  const depotOptionsForCnf = props.mode === "open" ? props.depots.filter((d) => d.cnfId === draft.cnfId) : [];
  const areaOptions =
    props.mode === "locked"
      ? props.areas
      : props.depots.find((d) => d.id === draft.depotId)?.areas ?? [];
  const areaName = areaOptions.find((a) => a.id === draft.areaId)?.name ?? "";

  function goDetails() {
    setError("");
    if (!/^\d{10}$/.test(draft.phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (checking) return; // wait for the in-flight lookup
    if (dup) return; // duplicate card is already visible; button is disabled
    setStep("details");
  }

  function goReview() {
    setError("");
    if (!draft.name.trim() || !draft.depotId || !draft.areaId || !draft.type) {
      setError("Fill name, depot, area and type.");
      return;
    }
    setStep("review");
  }

  async function submit() {
    setError("");
    setBusy(true);
    const payload = {
      name: draft.name,
      phone: draft.phone,
      address: draft.address,
      depotId: draft.depotId,
      areaId: draft.areaId,
      type: draft.type as NewCounterInput["type"],
      gps: draft.gps,
    };
    const res = isSupervisor
      ? await createCounterBySupervisor(payload)
      : await createCounter(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(doneHref);
    router.refresh();
  }

  return (
    <div className="card mx-auto max-w-xl overflow-hidden" style={{ animation: "fadeUp .3s ease" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3.5 px-6 py-4.5"
        style={{ background: "var(--gradient-cosmic)", color: "#fff" }}
      >
        <button
          onClick={() => router.push(backHref)}
          aria-label="Back"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-0 text-white"
          style={{ background: "rgba(255,255,255,.16)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="text-[18px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Add New Counter
        </div>
      </div>

      {/* Step bar */}
      <div className="flex gap-2 px-6 pt-4 pb-1">
        {steps.map((s, i) => {
          const done = i <= stepIdx;
          return (
            <div key={s.key} className="flex-1">
              <div
                className="h-[3px] rounded-full"
                style={{ background: done ? "var(--accent)" : "var(--hairline)" }}
              />
              <div
                className="mt-1.5 text-[11.5px] font-semibold"
                style={{ color: done ? "var(--accent)" : "var(--ink-3)" }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 pt-2 pb-7">
        {step === "duplicate" && (
          <>
            <h4 className="page-title mt-4 mb-1">Check for duplicates</h4>
            <p className="mb-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
              Search by mobile number first — it&apos;s the unique ID for a
              counter, unlike free-text shop names.
            </p>
            <div className="field mb-2.5">
              <label>Owner / Counter Mobile Number *</label>
              <input
                className="inp"
                type="tel"
                inputMode="tel"
                maxLength={10}
                placeholder="10-digit mobile"
                value={draft.phone}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setDraft({ ...draft, phone: next });
                  setDup(null);
                  setError("");
                  setChecking(/^\d{10}$/.test(next));
                }}
              />
              {checking && (
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>Checking…</p>
              )}
              {!checking && !dup && /^\d{10}$/.test(draft.phone) && (
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--success)" }}>
                  ✓ New number — no existing counter with this mobile.
                </p>
              )}
            </div>
            {dup && (
              <div className="mb-3.5 rounded-xl p-3.5" style={{ background: "rgba(178,94,0,.1)" }}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--warning)" }}>
                  This mobile number is already a counter
                </div>
                <div className="text-[13px]" style={{ color: "var(--ink-1)" }}>
                  {dup.name} · {dup.type} · {dup.area}
                  {dup.depotName && ` · ${dup.depotName}`}
                </div>
                {dup.id && dup.canVisit && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-2.5"
                    onClick={() => {
                      router.push(`/field/counter/${dup.id}`);
                      router.refresh();
                    }}
                  >
                    Add a visit to this counter →
                  </button>
                )}
                {dup.id && dup.canVisit === false && (
                  <p className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
                    It&apos;s in another depot, so you can&apos;t add a visit to it from here.
                  </p>
                )}
              </div>
            )}
            {error && !dup && <ErrorText>{error}</ErrorText>}
            <button
              className="btn btn-primary mt-2 w-full justify-center py-3.5"
              onClick={goDetails}
              disabled={busy || checking || !!dup || !/^\d{10}$/.test(draft.phone)}
            >
              Continue
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <h4 className="page-title mt-4 mb-4">Counter Identity</h4>
            <Field label="Name of Counter/Point of Contact *">
              <input
                className="inp"
                type="text"
                placeholder="e.g. Shree Ganesh Kirana"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Address">
              <input
                className="inp"
                type="text"
                placeholder="Street, landmark, village"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </Field>

            {props.mode === "locked" ? (
              <div className="mb-3.5 grid grid-cols-2 gap-3.5">
                <Field label="C&F">
                  <input className="inp" type="text" value={cnfName} disabled />
                </Field>
                <Field label="Depot">
                  <input className="inp" type="text" value={depotName} disabled />
                </Field>
              </div>
            ) : (
              <div className="mb-3.5 grid grid-cols-2 gap-3.5">
                <div className="field">
                  <label>C&F *</label>
                  <select
                    className="inp"
                    value={draft.cnfId}
                    onChange={(e) => setDraft({ ...draft, cnfId: e.target.value, depotId: "", areaId: "" })}
                  >
                    <option value="">Select</option>
                    {props.cnfs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Depot *</label>
                  <select
                    className="inp"
                    value={draft.depotId}
                    disabled={!draft.cnfId}
                    onChange={(e) => setDraft({ ...draft, depotId: e.target.value, areaId: "" })}
                  >
                    <option value="">{draft.cnfId ? "Select" : "Pick a C&F first"}</option>
                    {depotOptionsForCnf.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="field mb-3.5">
              <label>Area *</label>
              <select
                className="inp"
                value={draft.areaId}
                disabled={props.mode === "open" && !draft.depotId}
                onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}
              >
                <option value="">Select</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="field mb-4">
              <label>Type of Counter *</label>
              <div className="flex flex-wrap gap-2">
                {counterTypes.map((t) => {
                  const active = draft.type === t;
                  return (
                    <button
                      key={t}
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
                GPS Coordinates *
              </label>
              <GpsCapture value={draft.gps} onCapture={(gps) => setDraft({ ...draft, gps })} />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex gap-3">
              <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => setStep("duplicate")}>
                Back
              </button>
              <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={goReview}>
                Review
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <h4 className="page-title mt-4 mb-4">Review &amp; submit</h4>
            <div className="mb-5 rounded-2xl p-5" style={{ background: "var(--bg-soft)" }}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 text-[13px]">
                <Review k="Name" v={draft.name} />
                <Review k="Type" v={draft.type} />
                <Review k="Address" v={draft.address || "—"} />
                <Review k="C&F" v={cnfName} />
                <Review k="Depot" v={depotName} />
                <Review k="Area" v={areaName} />
                <Review k="GPS" v={draft.gps || "—"} />
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex gap-3">
              <button className="btn btn-secondary flex-1 justify-center py-3.5" onClick={() => setStep("details")}>
                Back
              </button>
              <button className="btn btn-primary flex-1 justify-center py-3.5" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit counter"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field mb-3.5">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Review({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-0.5" style={{ color: "var(--ink-3)" }}>{k}</div>
      <div className="font-semibold" style={{ color: "var(--ink-1)" }}>{v}</div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[12px]" style={{ color: "var(--danger)" }}>{children}</p>;
}
