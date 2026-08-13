"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BugSeverity, BugStatus, BugType } from "@/db/schema";
import { getBugScreenshot, setBugStatus } from "@/lib/bugs/actions";

export type BugRow = {
  id: string;
  type: BugType;
  title: string;
  description: string | null;
  severity: BugSeverity;
  page: string | null;
  status: BugStatus;
  reporterName: string | null;
  whenLabel: string;
  hasScreenshot: boolean;
};

const SEVERITY_STYLE: Record<BugSeverity, { label: string; bg: string; color: string }> = {
  low: { label: "Low", bg: "var(--bg-soft)", color: "var(--ink-2)" },
  medium: { label: "Medium", bg: "rgba(178,94,0,.1)", color: "var(--warning)" },
  high: { label: "High", bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
  critical: { label: "Critical", bg: "var(--danger)", color: "#fff" },
};

const STATUS_STYLE: Record<BugStatus, { label: string; bg: string; color: string }> = {
  open: { label: "Open", bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
  in_progress: { label: "In progress", bg: "rgba(178,94,0,.1)", color: "var(--warning)" },
  resolved: { label: "Resolved", bg: "rgba(30,158,90,.12)", color: "var(--success)" },
  closed: { label: "Closed", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

const STATUSES: BugStatus[] = ["open", "in_progress", "resolved", "closed"];

export function BugTracker({ reports }: { reports: BugRow[] }) {
  const [filter, setFilter] = useState<BugStatus | "all">("all");
  const visible = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const openCount = reports.filter((r) => r.status === "open").length;

  return (
    <div>
      {openCount > 0 && (
        <p className="mb-5 text-[13px] font-medium" style={{ color: "var(--ink-2)" }}>
          {openCount} still open.
        </p>
      )}

      <div className="mb-4 inline-flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
        {(["all", ...STATUSES] as const).map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--ink-2)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {s === "all" ? "All" : STATUS_STYLE[s].label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          No reports {filter === "all" ? "yet" : `with status “${STATUS_STYLE[filter as BugStatus].label}”`}.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <BugCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function BugCard({ report: r }: { report: BugRow }) {
  const router = useRouter();
  const [shot, setShot] = useState<string | null>(null);
  const [loadingShot, setLoadingShot] = useState(false);
  const [pending, start] = useTransition();

  const sev = SEVERITY_STYLE[r.severity];
  const st = STATUS_STYLE[r.status];

  function changeStatus(status: BugStatus) {
    start(async () => {
      await setBugStatus(r.id, status);
      router.refresh();
    });
  }

  async function toggleShot() {
    if (shot) {
      setShot(null);
      return;
    }
    setLoadingShot(true);
    setShot(await getBugScreenshot(r.id));
    setLoadingShot(false);
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px]">{r.type === "bug" ? "🐞" : "💡"}</span>
            <span className="text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>
              {r.title}
            </span>
            <span className="chip" style={{ background: sev.bg, color: sev.color, borderColor: "transparent" }}>
              {sev.label}
            </span>
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {r.reporterName ?? "Unknown"} · {r.whenLabel}
            {r.page && ` · ${r.page}`}
          </div>
          {r.description && (
            <p className="mt-2 whitespace-pre-wrap text-[13px]" style={{ color: "var(--ink-2)" }}>
              {r.description}
            </p>
          )}
          {r.hasScreenshot && (
            <div className="mt-2">
              <button className="link text-[12.5px]" onClick={toggleShot} disabled={loadingShot}>
                {loadingShot ? "Loading…" : shot ? "Hide screenshot" : "View screenshot"}
              </button>
              {shot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot}
                  alt="Reported screenshot"
                  className="mt-2 max-h-96 w-auto rounded-xl border"
                  style={{ borderColor: "var(--hairline-soft)" }}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-2">
          <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
            {st.label}
          </span>
          <select
            className="inp"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            value={r.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value as BugStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_STYLE[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
