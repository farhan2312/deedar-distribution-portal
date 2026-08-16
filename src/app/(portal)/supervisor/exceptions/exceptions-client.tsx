"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forceEndDay } from "@/lib/supervisor/actions";
import { useT } from "@/lib/i18n/provider";

export type ExceptionRow = {
  repUserId: string;
  repName: string;
  logDate: string;
  dateLabel: string;
  startLabel: string;
  startAtISO: string;
  elapsedLabel: string;
  isToday: boolean;
};

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for a datetime-local input. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExceptionsClient({ rows }: { rows: ExceptionRow[] }) {
  const t = useT();
  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>{t("No open day logs 🎉")}</p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {t("Everyone who started a day has clocked out.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ExceptionCard key={`${row.repUserId}__${row.logDate}`} row={row} />
      ))}
    </div>
  );
}

function ExceptionCard({ row }: { row: ExceptionRow }) {
  const router = useRouter();
  const t = useT();
  const [endValue, setEndValue] = useState(() => toLocalInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const local = new Date(endValue);
    if (Number.isNaN(local.getTime())) {
      setError(t("Pick a valid end time."));
      return;
    }
    start(async () => {
      const res = await forceEndDay(row.repUserId, row.logDate, local.toISOString());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {row.repName}
            </span>
            {!row.isToday && (
              <span className="chip" style={{ background: "rgba(199,38,59,.1)", color: "#C7263B", borderColor: "transparent" }}>
                {t("Past day")}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {row.dateLabel} · {t("started")} {row.startLabel} · {t("open")} {row.elapsedLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="field mb-0">
            <label>{t("End time")}</label>
            <input
              className="inp"
              type="datetime-local"
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
              style={{ width: "auto" }}
            />
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? t("Closing…") : t("Force-close day")}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-[13px] font-semibold" style={{ color: "#C7263B" }}>
          {error}
        </p>
      )}
    </div>
  );
}
