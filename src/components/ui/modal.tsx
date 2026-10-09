"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * A form in a dialog over the current page.
 *
 * Built for data entry, which shapes two choices: it closes only from its own
 * ✕ (or the form's Cancel) — never from a click on the backdrop, which would
 * throw away a half-filled visit to a stray tap — and the body scrolls inside
 * the dialog, so a long form never pushes its buttons off a phone screen.
 *
 * A bottom sheet on a phone, centred on anything wider, and portalled to
 * <body> so cards and sticky bars that open their own stacking contexts can't
 * clip it. The same shape as Report a Bug, so the two read as one family.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  width = "max-w-xl",
}: {
  title: string;
  /** Small label above the title, e.g. the counter the form is about. */
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** A Tailwind max-width class. */
  width?: string;
}) {
  // The page underneath stays put while the dialog is open; scrolling the form
  // shouldn't also scroll the report behind it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(15,18,32,.45)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full ${width} flex-col rounded-t-2xl bg-[var(--surface)] sm:rounded-2xl`}
        style={{ boxShadow: "var(--shadow-lg)", animation: "fadeUp .2s ease" }}
      >
        <div
          className="flex flex-none items-start justify-between gap-3 border-b px-5 py-4 sm:px-6"
          style={{ borderColor: "var(--hairline-soft)" }}
        >
          <div className="min-w-0">
            {eyebrow && (
              <div className="truncate text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                {eyebrow}
              </div>
            )}
            <h3 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-0 text-[20px] leading-none"
            style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
          >
            ×
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
