"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { StatCard } from "@/components/ui/stat-card";

export function SchemeCodes({ initialCount }: { initialCount: number }) {
  const t = useT();
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <div className="mb-5 max-w-xs">
        <StatCard label={t("Codes generated to date")} value={count.toLocaleString("en-IN")} />
      </div>
      <button className="btn btn-primary" onClick={() => setCount((c) => c + 10000)}>
        {t("Generate 10,000 codes")}
      </button>
    </div>
  );
}
