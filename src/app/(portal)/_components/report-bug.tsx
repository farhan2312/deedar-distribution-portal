"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import type { BugSeverity, BugType } from "@/db/schema";
import { submitBugReport } from "@/lib/bugs/actions";
import { MAX_SCREENSHOT_CHARS } from "@/lib/bugs/constants";
import { useT } from "@/lib/i18n/provider";

const SEVERITIES: BugSeverity[] = ["low", "medium", "high", "critical"];

/** Top-bar trigger + modal. Any signed-in user can file a report. */
export function ReportBug() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
        style={{ color: "var(--ink-1)" }}
      >
        {/* Red bug on a neutral button — the icon carries the signal. */}
        <BugIcon className="h-4 w-4" />
        {t("Report a Bug")}
      </button>
      {open && <ReportBugDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportBugDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const pathname = usePathname();

  const [type, setType] = useState<BugType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [page, setPage] = useState(pathname);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readImage = useCallback(
    (file: File) => {
      setError("");
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        if (url.length > MAX_SCREENSHOT_CHARS) {
          setError(t("That image is too large — keep it under about 1 MB."));
          return;
        }
        setScreenshot(url);
      };
      reader.readAsDataURL(file);
    },
    [t],
  );

  // Ctrl/Cmd+V anywhere in the dialog attaches a pasted screenshot.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith("image/"))
        ?.getAsFile();
      if (file) readImage(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [readImage]);

  function submit() {
    setError("");
    if (!title.trim()) {
      setError(t("Give it a short title."));
      return;
    }
    start(async () => {
      const res = await submitBugReport({ type, title, description, severity, page, screenshot });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ background: "rgba(15,18,32,.45)" }}
      onMouseDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Report a Bug")}
        className="w-full max-w-md rounded-2xl bg-white"
        style={{ boxShadow: "var(--shadow-lg)", animation: "fadeUp .2s ease" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--danger)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--danger)" }} />
              {t("Report a Bug")}
            </div>
            <h3 className="mt-1 text-[20px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {done ? t("Thanks!") : t("Report a Bug")}
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
              {done
                ? t("Your report went straight to the admin's Bug Tracker.")
                : t("Tell us what went wrong — it goes straight to the admin's Bug Tracker.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full"
            style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="px-6 pb-6 pt-5">
            <button className="btn btn-primary w-full justify-center py-3" onClick={onClose}>
              {t("Done")}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 h-px" style={{ background: "var(--hairline-soft)" }} />
            <div className="px-6 py-5">
              {/* Type */}
              <div className="field mb-4">
                <label>{t("Type")}</label>
                <div className="flex gap-0.5 rounded-xl p-[3px]" style={{ background: "var(--bg-soft)" }}>
                  {(["bug", "feature"] as const).map((k) => {
                    const active = type === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setType(k)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-colors"
                        style={{
                          background: active ? "#fff" : "transparent",
                          color: active ? (k === "bug" ? "var(--danger)" : "var(--warning)") : "var(--ink-3)",
                          boxShadow: active ? "var(--shadow-sm)" : "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {k === "bug" ? "🐞" : "💡"} {k === "bug" ? t("Bug") : t("Feature")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field mb-4">
                <label>
                  {t("Title")} <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  className="inp"
                  autoFocus
                  maxLength={200}
                  placeholder={t("Short summary of the issue")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="field mb-4">
                <label>{t("What happened?")}</label>
                <textarea
                  className="inp"
                  rows={4}
                  placeholder={t("Steps to reproduce, what you expected, what actually happened…")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="field">
                  <label>{t("Severity")}</label>
                  <select className="inp" value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {t(s.charAt(0).toUpperCase() + s.slice(1))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t("Page / where")}</label>
                  <input className="inp" value={page} onChange={(e) => setPage(e.target.value)} />
                </div>
              </div>

              {/* Screenshot */}
              <div className="field mb-1">
                <label>{t("Screenshot (optional)")}</label>
                {screenshot ? (
                  <div className="flex items-center gap-3 rounded-xl p-2" style={{ background: "var(--bg-soft)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot} alt="" className="h-14 w-20 flex-none rounded-lg object-cover" />
                    <span className="flex-1 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                      {t("Screenshot attached")}
                    </span>
                    <button type="button" className="link link-danger" onClick={() => setScreenshot(null)}>
                      {t("Remove")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-xl border border-dashed py-3 text-[12.5px] font-semibold"
                    style={{ borderColor: "var(--hairline)", background: "var(--bg-soft)", color: "var(--ink-2)" }}
                  >
                    📎 {t("Click to attach — or paste a screenshot (Ctrl/⌘+V)")}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readImage(f);
                  }}
                />
              </div>

              {error && (
                <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button className="btn btn-secondary px-5" onClick={onClose} disabled={pending}>
                  {t("Cancel")}
                </button>
                <button className="btn btn-primary px-5" onClick={submit} disabled={pending}>
                  {pending ? t("Sending…") : type === "bug" ? t("Submit Bug") : t("Submit Feature")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Ladybug-style bug in red — a filled body with legs and antennae, so it
 * reads as a bug at 16px rather than a generic outline. */
function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Legs + antennae */}
      <g stroke="#8E1524" strokeWidth="1.5">
        <path d="M3.5 11h2.8M17.7 11h2.8M4.4 6.6l2.3 1.6M19.6 6.6l-2.3 1.6M4.4 16.4l2.4-1.5M19.6 16.4l-2.4-1.5" />
        <path d="M9.4 4.1 8.2 2.4M14.6 4.1l1.2-1.7" />
      </g>
      {/* Body */}
      <path
        d="M12 5.4c3.4 0 5.9 2.7 5.9 6.3S15.4 19 12 19s-5.9-3.7-5.9-7.3S8.6 5.4 12 5.4Z"
        fill="#E02B3F"
        stroke="#8E1524"
        strokeWidth="1.4"
      />
      {/* Head + wing split */}
      <path d="M12 5.4c1.5 0 2.6 1 2.6 2.3H9.4C9.4 6.4 10.5 5.4 12 5.4Z" fill="#8E1524" />
      <path d="M12 7.7V19" stroke="#8E1524" strokeWidth="1.2" />
      {/* Spots */}
      <circle cx="9.5" cy="11" r="1" fill="#8E1524" />
      <circle cx="14.5" cy="11" r="1" fill="#8E1524" />
      <circle cx="10.1" cy="15" r=".85" fill="#8E1524" />
      <circle cx="13.9" cy="15" r=".85" fill="#8E1524" />
    </svg>
  );
}
