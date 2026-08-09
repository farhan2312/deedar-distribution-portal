"use client";

import { useState } from "react";

const HISTORY = [
  { date: "2026-08-08", start: "09:12", end: "17:48", onJob: "8h 36m" },
  { date: "2026-08-07", start: "09:31", end: "18:02", onJob: "8h 31m" },
  { date: "2026-08-06", start: "09:04", end: "17:20", onJob: "8h 16m" },
];

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function diffLabel(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function FieldDayLogPage() {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const complete = !!start && !!end;

  return (
    <div className="mx-auto max-w-lg pt-4 text-center" style={{ animation: "fadeUp .3s ease" }}>
      <h3 className="text-[20px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Today&apos;s Day Log
      </h3>
      <p className="mt-1 mb-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Record your visit start and end time for the day.
      </p>

      <div className="card p-6 text-left">
        <LogRow
          label="Visit start time"
          value={start ?? "—"}
          btnLabel="Start"
          disabled={!!start}
          onClick={() => setStart(nowHHMM())}
        />
        <LogRow
          label="Visit end time"
          value={end ?? "—"}
          btnLabel="End"
          disabled={!start || !!end}
          onClick={() => setEnd(nowHHMM())}
          last
        />
      </div>

      {complete && (
        <div className="mt-5 mb-2">
          <p className="text-[13px] font-semibold" style={{ color: "var(--success)" }}>
            Day complete — logged for supervisor review.
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
            On Job: <strong>{diffLabel(start!, end!)}</strong> — used for travel /
            idle / counter-time analysis.
          </p>
        </div>
      )}

      <div className="mt-8 text-left">
        <h6 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
          Previous days
        </h6>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {["Date", "Start", "End", "On Job"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.date}>
                  <td className="font-medium">{h.date}</td>
                  <td>{h.start}</td>
                  <td>{h.end}</td>
                  <td>{h.onJob}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LogRow({
  label,
  value,
  btnLabel,
  disabled,
  onClick,
  last,
}: {
  label: string;
  value: string;
  btnLabel: string;
  disabled: boolean;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: last ? "none" : "1px solid var(--hairline-soft)" }}
    >
      <div>
        <div className="eyebrow">{label}</div>
        <div className="mt-0.5 text-[20px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {value}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onClick} disabled={disabled}>
        {btnLabel}
      </button>
    </div>
  );
}
