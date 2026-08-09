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
    <div style={{ maxWidth: 480, textAlign: "center", paddingTop: 24, animation: "fadeUp .3s ease" }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 20,
          margin: "0 0 4px",
          color: "var(--ink-1)",
        }}
      >
        Today&apos;s Day Log
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 28px" }}>
        Record your visit start and end time for the day.
      </p>

      <div className="card" style={{ padding: 24, textAlign: "left", marginBottom: 20 }}>
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
        <>
          <p style={{ fontSize: 13, color: "var(--success)", fontWeight: 600, margin: "0 0 6px" }}>
            Day complete — logged for supervisor review.
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 28px" }}>
            On Job: <strong>{diffLabel(start!, end!)}</strong> — used for travel /
            idle / counter-time analysis.
          </p>
        </>
      )}

      <div style={{ textAlign: "left" }}>
        <h6
          style={{
            fontSize: 11,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: "0 0 10px",
          }}
        >
          Previous days
        </h6>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Date", "Start", "End", "On Job"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 11,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    padding: "8px 4px",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((h) => (
              <tr key={h.date}>
                {[h.date, h.start, h.end, h.onJob].map((cell, i) => (
                  <td
                    key={i}
                    style={{ padding: "10px 4px", borderBottom: "1px solid var(--hairline-soft)" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--hairline-soft)",
      }}
    >
      <div>
        <div className="eyebrow" style={{ fontSize: 11 }}>
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 20,
            marginTop: 2,
            color: "var(--ink-1)",
          }}
        >
          {value}
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={onClick}
        disabled={disabled}
      >
        {btnLabel}
      </button>
    </div>
  );
}
