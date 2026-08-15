"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { DeleteImpact } from "@/lib/admin/actions";
import type { WriteResult } from "@/lib/db-errors";

/**
 * The app's single delete affordance: click → confirmation dialog naming the
 * thing → run the action → report what happened (deleted, or why not).
 *
 * Deletes here are destructive and often blocked (a depot still holding areas,
 * a state still holding a C&F), so both halves matter: nothing is removed on a
 * stray click, and the outcome is always stated rather than silently reloading.
 *
 * Portalled to <body> — triggers sit inside cards and sticky bars that open
 * their own stacking contexts, which would otherwise clip or bury the dialog.
 */
export function ConfirmDelete({
  action,
  itemLabel,
  itemName,
  trigger = "link",
  loadImpact,
  warning,
  onDeleted,
}: {
  /** Runs on confirm. Returning a WriteResult lets us show the refusal reason. */
  action: () => Promise<WriteResult | void>;
  /** What kind of thing this is, e.g. "depot" — used in the prompt. */
  itemLabel: string;
  /** The specific row's name, quoted back so the admin sees what they're deleting. */
  itemName?: string;
  /** `icon` = trash button, `link` = "Delete" text, `x` = compact × for chips. */
  trigger?: "link" | "icon" | "x";
  /**
   * Optional: counts everything the delete will take with it. Fetched when the
   * dialog opens, so a cascade is spelled out ("…and 210 visits") before the
   * admin commits — deleting a counter destroys visit history that can't be
   * re-created, so it must never be a surprise.
   */
  loadImpact?: () => Promise<DeleteImpact>;
  /** Static consequence spelled out in the dialog, for cascades a count can't
   * capture — e.g. deleting a user wipes their visit history. */
  warning?: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [pending, start] = useTransition();

  function openDialog() {
    setError("");
    setImpact(null);
    setOpen(true);
    if (!loadImpact) return;
    setLoadingImpact(true);
    // Deliberately in the click handler, not an effect: it's a user action with
    // a clear start, and React 19's lint forbids setState inside an effect body.
    loadImpact()
      .then(setImpact)
      .catch(() => setImpact(null))
      .finally(() => setLoadingImpact(false));
  }

  function confirm() {
    setError("");
    start(async () => {
      const res = await action();
      // `void` means the action has no failure channel — treat as success.
      if (res && !res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setDone(true);
      onDeleted?.();
    });
  }

  return (
    <>
      {trigger === "x" ? (
        <button
          type="button"
          aria-label={`Delete ${itemLabel}`}
          onClick={openDialog}
          className="ml-1 border-0 bg-transparent px-0.5 leading-none"
          style={{ color: "var(--ink-3)", fontSize: 13 }}
        >
          ×
        </button>
      ) : trigger === "icon" ? (
        <button
          type="button"
          aria-label={`Delete ${itemLabel}`}
          title={`Delete ${itemLabel}`}
          onClick={openDialog}
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: "var(--hairline)", color: "var(--danger)", background: "var(--surface)" }}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      ) : (
        <span className="inline-flex flex-col items-end gap-1">
          <button type="button" className="link link-danger" onClick={openDialog}>
            Delete
          </button>
          {done && (
            <span className="text-[11.5px] font-medium" style={{ color: "var(--success)" }}>
              Deleted
            </span>
          )}
        </span>
      )}

      {trigger === "icon" && done && (
        <span className="ml-2 text-[11.5px] font-medium" style={{ color: "var(--success)" }}>
          Deleted
        </span>
      )}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
            style={{ background: "rgba(15,18,32,.45)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !pending) setOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={`Delete ${itemLabel}`}
              className="w-full max-w-sm rounded-t-2xl p-5 sm:rounded-2xl"
              style={{
                background: "var(--surface)",
                boxShadow: "var(--shadow-lg)",
                animation: "fadeUp .2s ease",
                paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full"
                  style={{ background: "rgba(199,38,59,.1)" }}
                >
                  <TrashIcon className="h-5 w-5" style={{ color: "var(--danger)" }} />
                </span>
                <div className="min-w-0">
                  <h3
                    className="text-[16px] font-bold"
                    style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
                  >
                    Delete {itemLabel}?
                  </h3>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    {itemName ? (
                      <>
                        <strong style={{ color: "var(--ink-1)" }}>{itemName}</strong> will be removed.
                      </>
                    ) : (
                      <>This {itemLabel} will be removed.</>
                    )}{" "}
                    This can&apos;t be undone.
                  </p>
                </div>
              </div>

              {loadingImpact && (
                <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  Checking what this will remove…
                </p>
              )}

              {impact && <ImpactWarning impact={impact} itemLabel={itemLabel} />}

              {warning && (
                <div
                  className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium"
                  style={{ background: "rgba(199,38,59,.08)", color: "var(--danger)" }}
                >
                  <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" />
                  </svg>
                  <span>{warning}</span>
                </div>
              )}

              {error && (
                <p
                  className="mt-3 rounded-xl px-3 py-2.5 text-[12.5px] font-medium"
                  style={{ background: "rgba(199,38,59,.08)", color: "var(--danger)" }}
                >
                  {error}
                </p>
              )}

              <div className="mt-4 flex gap-2.5">
                <button
                  className="btn btn-secondary flex-1 justify-center"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  className="btn flex-1 justify-center text-white"
                  style={{ background: "var(--danger)" }}
                  onClick={confirm}
                  disabled={pending}
                >
                  {pending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Spells out the cascade. Visits are called out separately from the structural
 * rows because they're the irreplaceable part — field history that can't be
 * re-entered once gone.
 */
function ImpactWarning({ impact, itemLabel }: { impact: DeleteImpact; itemLabel: string }) {
  const rows: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) rows.push(`${n} ${n === 1 ? one : many}`);
  };
  add(impact.cnfs, "C&F HQ", "C&F HQs");
  add(impact.depots, "depot", "depots");
  add(impact.areas, "area", "areas");
  add(impact.counters, "counter", "counters");

  if (rows.length === 0 && impact.visits === 0) {
    return (
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        Nothing else is attached to this {itemLabel}.
      </p>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl px-3 py-2.5"
      style={{ background: "rgba(224,177,92,.14)", border: "1px solid rgba(224,177,92,.4)" }}
    >
      <div className="text-[12.5px] font-semibold" style={{ color: "#B25E00" }}>
        This also deletes everything underneath
      </div>
      {rows.length > 0 && (
        <div className="mt-1 text-[12.5px]" style={{ color: "var(--ink-1)" }}>
          {rows.join(" · ")}
        </div>
      )}
      {impact.visits > 0 && (
        <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--danger)" }}>
          {impact.visits} visit{impact.visits === 1 ? "" : "s"} of field history will be lost
          permanently.
        </div>
      )}
    </div>
  );
}

function TrashIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}
