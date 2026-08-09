"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui/stat-card";

export function SchemeCodes({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <h4 className="page-title">Scheme code batches</h4>
      <p className="page-subtitle mb-5">
        Unique, one-time-redeemable codes printed on packs/cartons.
      </p>
      <div className="mb-5 max-w-xs">
        <StatCard label="Codes generated to date" value={count.toLocaleString("en-IN")} />
      </div>
      <button className="btn btn-primary" onClick={() => setCount((c) => c + 10000)}>
        Generate 10,000 codes
      </button>
    </div>
  );
}
