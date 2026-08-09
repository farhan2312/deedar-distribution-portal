"use client";

import { useState } from "react";

export function SchemeCodes({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Scheme code batches
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
        Unique, one-time-redeemable codes printed on packs/cartons.
      </p>
      <div className="card" style={{ padding: 20, maxWidth: 340, marginBottom: 18, boxShadow: "var(--shadow-md)" }}>
        <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>
          Codes generated to date
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28 }}>
          {count.toLocaleString("en-IN")}
        </div>
      </div>
      <button className="btn btn-primary" onClick={() => setCount((c) => c + 10000)}>
        Generate 10,000 codes
      </button>
    </div>
  );
}
