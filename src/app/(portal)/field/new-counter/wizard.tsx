"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkDuplicate,
  createCounter,
  type DuplicateMatch,
  type NewCounterInput,
} from "@/lib/field/actions";

export type DepotOption = { name: string; areas: string[] };

const COUNTER_TYPES: NewCounterInput["type"][] = [
  "Kirana",
  "Paan",
  "Tea Stall",
  "Wholesale",
  "Vegetable Shop",
  "Others",
];

type Step = "duplicate" | "details" | "review";

export function NewCounterWizard({
  depots,
  cnfName,
}: {
  depots: DepotOption[];
  cnfName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("duplicate");
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    address: "",
    depotName: "",
    areaName: "",
    type: "" as NewCounterInput["type"] | "",
    gps: "",
  });
  const [dup, setDup] = useState<DuplicateMatch>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const steps: { key: Step; label: string }[] = [
    { key: "duplicate", label: "Check Duplicate" },
    { key: "details", label: "Counter Details" },
    { key: "review", label: "Review" },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);
  const areaOptions = depots.find((d) => d.name === draft.depotName)?.areas ?? [];

  async function goDetails() {
    setError("");
    if (!/^\d{10}$/.test(draft.phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    const match = await checkDuplicate(draft.phone);
    setBusy(false);
    setDup(match);
    if (match) {
      setError("This mobile number is already a counter.");
      return;
    }
    setStep("details");
  }

  function goReview() {
    setError("");
    if (!draft.name.trim() || !draft.depotName || !draft.areaName || !draft.type) {
      setError("Fill name, depot, area and type.");
      return;
    }
    setStep("review");
  }

  async function submit() {
    setError("");
    setBusy(true);
    const res = await createCounter({
      name: draft.name,
      phone: draft.phone,
      address: draft.address,
      depotName: draft.depotName,
      areaName: draft.areaName,
      type: draft.type as NewCounterInput["type"],
      gps: draft.gps,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/field/beat");
    router.refresh();
  }

  return (
    <div style={{ animation: "fadeUp .3s ease", margin: "-28px -32px 0" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 24px",
          background: "var(--gradient-cosmic)",
          color: "#fff",
        }}
      >
        <button
          onClick={() => router.push("/field/beat")}
          aria-label="Back"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,.16)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, flex: 1 }}>
          Add New Counter
        </div>
      </div>

      {/* Step bar */}
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 6px", maxWidth: 640 }}>
        {steps.map((s, i) => {
          const done = i <= stepIdx;
          return (
            <div key={s.key} style={{ flex: 1 }}>
              <div
                style={{
                  height: 3,
                  borderRadius: "var(--r-pill)",
                  background: done ? "var(--accent)" : "var(--hairline)",
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 6,
                  color: done ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "8px 24px 32px", maxWidth: 640 }}>
        {step === "duplicate" && (
          <>
            <h4 style={h4Style}>Check for duplicates</h4>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
              Search by mobile number first — it&apos;s the unique ID for a
              counter, unlike free-text shop names.
            </p>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Owner / Counter Mobile Number *</label>
              <input
                className="inp"
                type="tel"
                inputMode="tel"
                maxLength={10}
                placeholder="10-digit mobile"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            {dup && (
              <div style={{ marginBottom: 14, padding: 14, borderRadius: "var(--r-md)", background: "rgba(178,94,0,.1)" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--warning)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  This mobile number is already a counter
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-1)" }}>
                  {dup.name} · {dup.type} · {dup.area}
                </div>
              </div>
            )}
            {error && !dup && <ErrorText>{error}</ErrorText>}
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: 14, marginTop: 8 }}
              onClick={goDetails}
              disabled={busy}
            >
              {busy ? "Checking…" : "Confirm — this is new"}
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <h4 style={h4Style}>Counter Identity</h4>
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
            <Field label="C&F">
              <input
                className="inp"
                type="text"
                value={cnfName}
                disabled
                style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div className="field">
                <label>Depot *</label>
                <select
                  className="inp"
                  value={draft.depotName}
                  onChange={(e) => setDraft({ ...draft, depotName: e.target.value, areaName: "" })}
                >
                  <option value="">Select</option>
                  {depots.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Area *</label>
                <select
                  className="inp"
                  value={draft.areaName}
                  onChange={(e) => setDraft({ ...draft, areaName: e.target.value })}
                >
                  <option value="">Select</option>
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Type of Counter *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {COUNTER_TYPES.map((t) => {
                  const active = draft.type === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setDraft({ ...draft, type: t })}
                      style={{
                        border: `1px solid ${active ? "var(--accent)" : "var(--hairline)"}`,
                        padding: "9px 16px",
                        borderRadius: "var(--r-pill)",
                        fontSize: 13,
                        fontWeight: 600,
                        background: active ? "var(--accent)" : "transparent",
                        color: active ? "#fff" : "var(--ink-1)",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: 16, borderRadius: "var(--r-lg)", background: "var(--accent-tint)", marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", display: "block", marginBottom: 10 }}>
                GPS Coordinates *
              </label>
              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: 13 }}
                onClick={() =>
                  setDraft({ ...draft, gps: `25.${700 + Math.floor(Math.random() * 99)}, 76.${100 + Math.floor(Math.random() * 99)}` })
                }
              >
                {draft.gps ? `Captured · ${draft.gps}` : "Capture Current Location"}
              </button>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-secondary" style={twoBtn} onClick={() => setStep("duplicate")}>
                Back
              </button>
              <button className="btn btn-primary" style={twoBtn} onClick={goReview}>
                Review
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <h4 style={h4Style}>Review &amp; submit</h4>
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", fontSize: 13 }}>
                <Review k="Name" v={draft.name} />
                <Review k="Type" v={draft.type} />
                <Review k="Address" v={draft.address || "—"} />
                <Review k="C&F" v={cnfName} />
                <Review k="Depot" v={draft.depotName} />
                <Review k="Area" v={draft.areaName} />
                <Review k="GPS" v={draft.gps || "—"} />
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-secondary" style={twoBtn} onClick={() => setStep("details")}>
                Back
              </button>
              <button className="btn btn-primary" style={twoBtn} onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit counter"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const h4Style: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 20,
  margin: "20px 0 16px",
  color: "var(--ink-1)",
};
const twoBtn: React.CSSProperties = { flex: 1, justifyContent: "center", padding: 14 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Review({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ color: "var(--ink-3)", marginBottom: 2 }}>{k}</div>
      <div style={{ fontWeight: 600 }}>{v}</div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 12px" }}>{children}</p>;
}
