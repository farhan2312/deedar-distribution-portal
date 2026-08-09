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

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DayLogClient({ firstName }: { firstName: string }) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-[26px] font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
            suppressHydrationWarning
          >
            {greeting()}, {firstName}! 👋
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>
            Let&apos;s track your day and make it count.
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border bg-white px-4 py-2.5 text-[13.5px] font-semibold"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-1)" }}
          suppressHydrationWarning
        >
          <CalendarIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />
          {todayLabel}
          <ChevronDownIcon className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Today's Plan */}
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-3.5">
            <IconBadge>
              <CalendarIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />
            </IconBadge>
            <div>
              <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                Today&apos;s Plan
              </div>
              <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>Log your visit timings for today</div>
            </div>
          </div>

          <PlanRow
            icon={<PlayIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
            label="Visit Start Time"
            value={start ? to12h(start) : "Not started yet"}
            btnLabel="Start"
            active
            disabled={!!start}
            onClick={() => setStart(nowHHMM())}
          />
          <PlanRow
            icon={<StopIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
            label="Visit End Time"
            value={end ? to12h(end) : "Not ended yet"}
            btnLabel="End"
            active={!!start && !end}
            disabled={!start || !!end}
            onClick={() => setEnd(nowHHMM())}
            last
          />
        </div>

        {/* Motivational card */}
        <div
          className="flex flex-col items-center justify-center rounded-2xl p-7 text-center text-white"
          style={{ background: "var(--gradient-cosmic)", boxShadow: "var(--shadow-md)" }}
        >
          <TrendIllustration />
          <div className="mt-4 text-[17px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Every visit counts!
          </div>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.82)" }}>
            Keep logging your visits and achieve more everyday.
          </p>
        </div>
      </div>

      {/* Previous Days */}
      <div className="card mt-5 p-6">
        <div className="mb-4 flex items-center gap-3.5">
          <IconBadge>
            <HistoryIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </IconBadge>
          <div>
            <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              Previous Days
            </div>
            <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>Your recent visit history</div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Start time</th>
                <th>End time</th>
                <th>On job</th>
              </tr>
            </thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.date}>
                  <td>
                    <div className="flex items-center gap-2 font-medium">
                      <CalendarIcon className="h-4 w-4 flex-none" style={{ color: "var(--ink-3)" }} />
                      {formatDay(h.date)}
                    </div>
                  </td>
                  <td>{to12h(h.start)}</td>
                  <td>{to12h(h.end)}</td>
                  <td>{h.onJob}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Encouragement banner */}
      <div
        className="mt-5 flex items-center gap-4 rounded-2xl p-5"
        style={{ background: "var(--accent-tint)" }}
      >
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
          style={{ background: "var(--accent)" }}
        >
          <StarIcon className="h-5 w-5 text-white" />
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
            Keep up the great work!
          </div>
          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            Consistency today leads to success tomorrow.
          </p>
        </div>
        <TrophyIllustration />
      </div>
    </div>
  );
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
      style={{ background: "var(--accent-tint)" }}
    >
      {children}
    </span>
  );
}

function PlanRow({
  icon,
  label,
  value,
  btnLabel,
  active,
  disabled,
  onClick,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  btnLabel: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-4"
      style={{ borderBottom: last ? "none" : "1px solid var(--hairline-soft)" }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border"
          style={{ borderColor: "var(--hairline)", background: "#fff" }}
        >
          {icon}
        </span>
        <div>
          <div className="text-[14.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{label}</div>
          <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>{value}</div>
        </div>
      </div>
      <button
        className="btn"
        style={{
          background: active ? "var(--accent)" : "var(--accent-tint)",
          color: active ? "#fff" : "var(--accent)",
        }}
        onClick={onClick}
        disabled={disabled}
      >
        {btnLabel}
      </button>
    </div>
  );
}

function TrendIllustration() {
  return (
    <svg width="120" height="84" viewBox="0 0 120 84" fill="none">
      <circle cx="60" cy="42" r="40" fill="rgba(255,255,255,.1)" />
      <circle cx="18" cy="14" r="3" fill="rgba(255,255,255,.5)" />
      <circle cx="104" cy="20" r="2" fill="rgba(255,255,255,.5)" />
      <circle cx="98" cy="66" r="2.5" fill="rgba(255,255,255,.4)" />
      <path d="M18 58 L40 40 L56 50 L88 20" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="58" r="3.5" fill="#fff" />
      <circle cx="40" cy="40" r="3.5" fill="#fff" />
      <circle cx="56" cy="50" r="3.5" fill="#fff" />
      <path d="M88 20 L88 8 L100 14 Z" fill="#fff" />
      <line x1="88" y1="20" x2="88" y2="8" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function TrophyIllustration() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="flex-none">
      <circle cx="28" cy="28" r="28" fill="var(--accent-tint)" />
      <circle cx="14" cy="12" r="2" fill="var(--accent)" opacity="0.5" />
      <circle cx="46" cy="16" r="1.6" fill="var(--accent)" opacity="0.5" />
      <path
        d="M22 18h12v8a6 6 0 0 1-12 0v-8Z"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 20h-4a3 3 0 0 0 3 3M34 20h4a3 3 0 0 1-3 3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 32v4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 40h10l-1.5-4h-7L23 40Z" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function ChevronDownIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PlayIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7Z" />
    </svg>
  );
}

function StopIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function HistoryIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7L6 21l1.6-7-5.4-4.7 7.1-.7Z" />
    </svg>
  );
}
