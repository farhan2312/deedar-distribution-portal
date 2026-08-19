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
const BUBBLE_SIZE = 52;
const MINI_SIZE = 32;
/** Pointer-move threshold before a press counts as a drag instead of a tap.
 * 6 px is small enough for jitter-free repositioning but wide enough that a
 * clean tap never smears into a drag. */
const DRAG_THRESHOLD_PX = 6;
/** Keep the bubble at least this many px from every viewport edge on release. */
const EDGE_MARGIN = 8;
const POS_KEY = "chat.pos";
const MIN_KEY = "chat.min";

type BubblePos = { x: number; y: number };

/** Default position: bottom-right, kept above the fixed mobile tab bar. */
function defaultPos(): BubblePos {
  const w = typeof window === "undefined" ? 0 : window.innerWidth;
  const h = typeof window === "undefined" ? 0 : window.innerHeight;
  const isDesktop = w >= 768;
  const rightGap = isDesktop ? 24 : 16;
  const bottomGap = isDesktop ? 24 : 96; // mobile tab bar ~64px + safe area
  return {
    x: Math.max(EDGE_MARGIN, w - BUBBLE_SIZE - rightGap),
    y: Math.max(EDGE_MARGIN, h - BUBBLE_SIZE - bottomGap),
  };
}

/** Clamp a position to what's currently on-screen. Used after a drag and on
 * window resize — otherwise a bubble parked at the bottom of a tall phone
 * would float off the top on a smaller device or after keyboard open. */
function clampPos(pos: BubblePos, size: number): BubblePos {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.max(EDGE_MARGIN, Math.min(pos.x, w - size - EDGE_MARGIN)),
    y: Math.max(EDGE_MARGIN, Math.min(pos.y, h - size - EDGE_MARGIN)),
  };
}

export function ChatWidget({ accessRoles }: { accessRoles: AccessRole[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  /** `null` until the client mounts — SSR has no viewport to compute from,
   * and the first render must match the server to avoid a hydration warning
   * (so the bubble is deliberately invisible for one frame). */
  const [pos, setPos] = useState<BubblePos | null>(null);
  const draggedRef = useRef(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPos: BubblePos;
    moved: boolean;
  } | null>(null);
  const intents = useMemo(() => intentsForUser(accessRoles), [accessRoles]);

  // Hydrate persisted position + minimized state on mount, and re-clamp on
  // viewport changes so an off-screen bubble (e.g. rotated device) snaps back.
  useEffect(() => {
    // Read everything first, then apply the two setStates unconditionally at
    // the end. The `set-state-in-effect` compiler rule fires on a conditional
    // setState in an effect body; two unconditional calls React batches into
    // one render.
    let initial: BubblePos = defaultPos();
    let wasMin = false;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          initial = parsed;
        }
      }
      wasMin = localStorage.getItem(MIN_KEY) === "1";
    } catch {
      // Corrupt localStorage falls back to the default position silently.
    }
    // localStorage is browser-only, so hydration has to happen in an effect.
    // The compiler rule steers callers toward `useSyncExternalStore`, but this
    // call runs once, batches with `setMinimized` below into a single render,
    // and only ever transitions from the neutral SSR value to the persisted
    // one — the exact hydration case the rule's advice doesn't cover.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos(clampPos(initial, BUBBLE_SIZE));
    setMinimized(wasMin);

    function onResize() {
      setPos((p) => (p ? clampPos(p, BUBBLE_SIZE) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persist. Skipped for the `null` initial render so we don't overwrite
  // localStorage with nothing before hydration finishes.
  useEffect(() => {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
  }, [pos]);
  useEffect(() => {
    if (minimized) localStorage.setItem(MIN_KEY, "1");
    else localStorage.removeItem(MIN_KEY);
  }, [minimized]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return; // ignore right/middle mouse
    // Touch pointer over a `fixed` button auto-scrolls the page if we let it
    // through — capturing the pointer + preventing default keeps the drag
    // gesture ours, not the browser's.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: pos ?? defaultPos(),
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    draggedRef.current = true;
    const size = minimized ? MINI_SIZE : BUBBLE_SIZE;
    setPos(clampPos({ x: d.startPos.x + dx, y: d.startPos.y + dy }, size));
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    // `draggedRef` stays true until the click handler consumes it below.
  }

  function onClick() {
    // A drag that ended over the bubble fires a click too — swallow it so a
    // reposition doesn't accidentally open the panel or un-minimize.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (minimized) setMinimized(false);
    else setOpen(true);
  }

  // A role with no questions (e.g. Depot-only) gets no bubble at all rather
  // than one that opens onto an empty menu.
  if (intents.length === 0) return null;

  const size = minimized ? MINI_SIZE : BUBBLE_SIZE;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={minimized ? t("Show Ask") : t("Ask a question")}
        aria-expanded={open}
        title={minimized ? t("Show Ask") : undefined}
        // `touch-none` blocks the browser's default touch scroll while the
        // finger is on the bubble — otherwise dragging would scroll the page
        // instead of moving the bubble.
        className="fixed z-40 flex items-center justify-center rounded-full text-white transition-transform active:scale-95 touch-none"
        style={{
          // `pos == null` on first paint (pre-hydration) — hide instead of
          // flashing at the wrong corner. Sub-frame invisibility, but avoids
          // a jump the user would notice.
          visibility: pos ? "visible" : "hidden",
          left: pos ? pos.x : 0,
          top: pos ? pos.y : 0,
          height: size,
          width: size,
          background: "var(--accent)",
          boxShadow: "var(--shadow-lg)",
          opacity: minimized ? 0.75 : 1,
          // Suppress the default long-press context menu / callout on iOS so a
          // held drag doesn't pop the browser's "Save Image" sheet.
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <ChatIcon className={minimized ? "h-3.5 w-3.5" : "h-6 w-6"} />
      </button>
      {open && (
        <ChatPanel
          intents={intents}
          onClose={() => setOpen(false)}
          onMinimize={() => {
            setOpen(false);
            setMinimized(true);
          }}
        />
      )}
    </>
  );
}

function ChatPanel({
  intents,
  onClose,
  onMinimize,
}: {
  intents: Intent[];
  onClose: () => void;
  /** Close panel AND hide the bubble down to a small dot the user can tap
   * later to bring it back — the "get out of my way" option. */
  onMinimize: () => void;
}) {
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
          <div className="flex flex-none items-center gap-1.5">
            <button
              type="button"
              onClick={onMinimize}
              aria-label={t("Hide")}
              title={t("Hide until I tap again")}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
            >
              −
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
            >
              ✕
            </button>
          </div>
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
