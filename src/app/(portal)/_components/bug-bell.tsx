"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BugStatus } from "@/db/schema";
import { fetchBugInbox } from "@/lib/bugs/actions";
import type { BugInbox } from "@/lib/bugs/notifications";
import { useT } from "@/lib/i18n/provider";

const STATUS_STYLE: Record<BugStatus, { label: string; bg: string; color: string }> = {
  open: { label: "Open", bg: "rgba(199,38,59,.1)", color: "#C7263B" },
  in_progress: { label: "In progress", bg: "rgba(178,94,0,.1)", color: "#B25E00" },
  resolved: { label: "Resolved", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  closed: { label: "Closed", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

/**
 * Bug-report bell for the top bar. Admins see reports awaiting triage;
 * everyone else follows the reports they filed. The initial inbox is rendered
 * by the server (so the badge is correct on first paint) and re-read when the
 * panel is opened.
 */
export function BugBell({ initial }: { initial: BugInbox }) {
  const t = useT();
  // `fresh` only exists while the panel is open (set by the refresh below);
  // closing clears it so the server-rendered `initial` governs again. Derived
  // rather than mirrored into state, which would need a setState-in-effect.
  const [fresh, setFresh] = useState<BugInbox | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inbox = fresh ?? initial;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Refresh on open so a report filed moments ago shows up; on close, drop
    // back to whatever the server last rendered.
    if (next) void fetchBugInbox().then((data) => data && setFresh(data));
    else setFresh(null);
  }

  const badge = inbox.count > 9 ? "9+" : String(inbox.count);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t("Bug notifications")}
        aria-expanded={open}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--surface)] transition-colors"
        style={{ color: "var(--ink-2)" }}
      >
        <BellIcon className="h-[18px] w-[18px]" ringing={inbox.count > 0} />
        {inbox.count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-[3px] text-[9.5px] font-bold text-white"
            style={{ background: "var(--danger)" }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-[320px] overflow-hidden rounded-2xl bg-[var(--surface)]"
          style={{ border: "1px solid var(--hairline-soft)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="flex items-baseline justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
            <span className="text-[13px] font-bold" style={{ color: "var(--ink-1)" }}>
              {inbox.isTriage ? t("Bug reports") : t("Your reports")}
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {inbox.count} {t("active")}
            </span>
          </div>

          {inbox.items.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {inbox.isTriage ? t("No bug reports yet.") : t("You haven't reported anything yet.")}
            </p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto">
              {inbox.items.map((n) => {
                const st = STATUS_STYLE[n.status];
                return (
                  <li key={n.id} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                    <div className="flex items-start gap-2">
                      <span className="text-[13px] leading-5">{n.type === "bug" ? "🐞" : "💡"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>
                          {n.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
                          <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent", padding: "1px 7px", fontSize: 10 }}>
                            {st.label}
                          </span>
                          {n.reporterName && <span>{n.reporterName} ·</span>}
                          <span>{n.whenLabel}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {inbox.isTriage && (
            <Link
              href="/admin/bugs"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-[12.5px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {t("Open Bug Tracker")} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Filled amber bell, tilted like it's mid-ring. `ringing` adds a slow swing
 * so a waiting report is noticeable without being distracting. */
function BellIcon({ className, ringing }: { className?: string; ringing?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transform: ringing ? undefined : "rotate(-18deg)",
        transformOrigin: "50% 15%",
        animation: ringing ? "bellSwing 2.4s ease-in-out infinite" : undefined,
      }}
    >
      {/* Body */}
      <path
        d="M12 3a6 6 0 0 0-6 6c0 3.6-.9 5.4-1.8 6.4a1 1 0 0 0 .74 1.68h14.12a1 1 0 0 0 .74-1.68C18.9 14.4 18 12.6 18 9a6 6 0 0 0-6-6Z"
        fill="#F5B301"
        stroke="#C98A02"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Highlight */}
      <path d="M9.6 8.4a2.8 2.8 0 0 1 2.2-2.5" stroke="#FFE9A8" strokeWidth="1.4" strokeLinecap="round" />
      {/* Cap */}
      <path d="M10.7 3.2a1.4 1.4 0 0 1 2.6 0" stroke="#C98A02" strokeWidth="1.6" strokeLinecap="round" />
      {/* Clapper */}
      <path d="M10.2 19.2a2 2 0 0 0 3.6 0" fill="#F5B301" stroke="#C98A02" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
