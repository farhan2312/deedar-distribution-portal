"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { AccessRole } from "@/db/schema";
import { askIntent } from "@/lib/chatbot/actions";
import {
  INTENT_GROUPS,
  intentsForUser,
  type Intent,
  type IntentAnswer,
} from "@/lib/chatbot/catalog";
import { useT } from "@/lib/i18n/provider";
import { ReportBugDialog } from "./report-bug";

/**
 * "Ask" bubble — a fixed bottom-right launcher for the predefined-question
 * chatbot, available on every portal screen.
 *
 * Only the catalog is imported here (client-safe metadata); every answer comes
 * back from the `askIntent` server action, so no query code reaches the bundle.
 */
export function ChatWidget({ accessRoles }: { accessRoles: AccessRole[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const intents = useMemo(() => intentsForUser(accessRoles), [accessRoles]);

  // A role with no questions (e.g. Depot-only) gets no bubble at all rather
  // than one that opens onto an empty menu.
  if (intents.length === 0) return null;

  return (
    <>
      {/* `bottom-24` on phones clears the fixed mobile tab bar (bottom-0, ~64px
          plus safe area); from `md` that bar is hidden so the bubble drops into
          the corner. Rendered as a root-level sibling of MobileNav, so it isn't
          trapped inside the top bar's `sticky z-20` stacking context. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Ask a question")}
        aria-expanded={open}
        className="fixed bottom-24 right-4 z-40 flex items-center justify-center rounded-full text-white transition-transform active:scale-95 md:bottom-6 md:right-6"
        // Size inline: 52px has no Tailwind step, and a 44px+ tap target is
        // the accessibility floor for a primary action on a phone.
        style={{
          height: 52,
          width: 52,
          background: "var(--accent)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <ChatIcon className="h-6 w-6" />
      </button>
      {open && <ChatPanel intents={intents} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatPanel({ intents, onClose }: { intents: Intent[]; onClose: () => void }) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);

  const [asked, setAsked] = useState<Intent | null>(null);
  const [answer, setAnswer] = useState<IntentAnswer | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [helpOpen, setHelpOpen] = useState(false);

  // Escape dismisses. No `open` guard needed — this component only exists
  // while the panel is open, so its state resets on every close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function ask(intent: Intent) {
    setAsked(intent);
    setAnswer(null);
    setError("");
    start(async () => {
      const res = await askIntent(intent.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnswer(res.answer);
    });
  }

  function back() {
    setAsked(null);
    setAnswer(null);
    setError("");
  }

  // Groups with nothing in them for this role are skipped entirely, so an ISR
  // never sees an empty "Company" header.
  const grouped = INTENT_GROUPS.map((group) => ({
    group,
    items: intents.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  if (helpOpen) {
    // Hand off to the real bug form; closing it closes the chatbot too, since
    // the user has moved on to a different task.
    return <ReportBugDialog onClose={onClose} />;
  }

  // Portalled for the same reason ReportBug is: an in-place panel would be
  // capped by the top bar's stacking context and painted over by the mobile
  // nav. Bottom sheet on phones, anchored bottom-right card from `sm`.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-end sm:justify-end sm:p-6"
      style={{ background: "rgba(15,18,32,.45)" }}
      onMouseDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Ask a question")}
        className="flex h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-[var(--surface)] sm:h-auto sm:max-h-[70dvh] sm:w-[380px] sm:rounded-2xl"
        style={{ boxShadow: "var(--shadow-lg)", animation: "fadeUp .2s ease" }}
      >
        {/* Header */}
        <div className="flex flex-none items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <div
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              {t("Ask")}
            </div>
            <h3
              className="mt-1 truncate text-[18px] font-bold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
            >
              {asked ? t(asked.label) : t("What would you like to know?")}
            </h3>
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

        <div className="mt-4 h-px flex-none" style={{ background: "var(--hairline-soft)" }} />

        {/* Body — scrolls independently so the footer stays reachable. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {asked ? (
            <AnswerView answer={answer} error={error} pending={pending} onClose={onClose} t={t} />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <div
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {t(group)}
                  </div>
                  <div className="space-y-1.5">
                    {items.map((intent) => (
                      <button
                        key={intent.id}
                        type="button"
                        onClick={() => ask(intent)}
                        className="w-full rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors"
                        style={{
                          borderColor: "var(--hairline-soft)",
                          background: "var(--surface)",
                          color: "var(--ink-1)",
                        }}
                      >
                        {t(intent.label)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex flex-none items-center justify-between gap-3 border-t px-5 pt-3"
          style={{
            borderColor: "var(--hairline-soft)",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          {asked ? (
            <button type="button" className="link" onClick={back}>
              ← {t("Ask something else")}
            </button>
          ) : (
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {t("Answers are live from your data.")}
            </span>
          )}
          <button
            type="button"
            className="link"
            style={{ color: "var(--ink-3)" }}
            onClick={() => setHelpOpen(true)}
          >
            {t("I need help")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AnswerView({
  answer,
  error,
  pending,
  onClose,
  t,
}: {
  answer: IntentAnswer | null;
  error: string;
  pending: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  if (pending) {
    return (
      <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        {t("Checking…")}
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  }
  if (!answer) return null;

  return (
    <div>
      <p className="text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>
        {answer.text}
      </p>

      {answer.items && answer.items.length > 0 && (
        <ul className="mt-3 rounded-xl" style={{ background: "var(--bg-soft)" }}>
          {answer.items.map((it, i) => (
            <li
              key={`${it.label}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]"
              style={{
                borderBottom:
                  i < answer.items!.length - 1 ? "1px solid var(--hairline-soft)" : undefined,
              }}
            >
              <span className="min-w-0 truncate" style={{ color: "var(--ink-1)" }}>
                {it.label}
              </span>
              {it.value && (
                <span className="flex-none tabular-nums" style={{ color: "var(--ink-3)" }}>
                  {it.value}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {answer.link && (
        <Link
          href={answer.link.href}
          onClick={onClose}
          className="btn btn-secondary btn-sm mt-3.5"
        >
          {answer.link.label} →
        </Link>
      )}
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-5A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
      <path d="M9.2 9.3a2.8 2.8 0 0 1 5.5.7c0 1.9-2.8 2.8-2.8 2.8" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}
