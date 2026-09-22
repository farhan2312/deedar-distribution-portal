"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BugSeverity, BugStatus, BugType } from "@/db/schema";
import { getBugScreenshot, setBugStatus } from "@/lib/bugs/actions";
import { useT } from "@/lib/i18n/provider";
import { SearchInput } from "@/components/ui/search-input";

/** Whole-tracker counts for the summary row — never narrowed by the filter. */
export type BugStats = {
  total: number;
  bugs: number;
  features: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  criticalOpen: number;
};

export type BugFilters = {
  type: BugType | null;
  severity: BugSeverity | null;
  q: string;
};

const SEVERITIES: BugSeverity[] = ["low", "medium", "high", "critical"];

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

/** `stripe` is the card's left edge — severity readable across a whole lane at
 * a glance, before any label is read. */
const SEVERITY_STYLE: Record<BugSeverity, { label: string; bg: string; color: string; stripe: string }> = {
  low: { label: "Low", bg: "var(--bg-soft)", color: "var(--ink-2)", stripe: "#A3A9B3" },
  medium: { label: "Medium", bg: "rgba(178,94,0,.1)", color: "var(--warning)", stripe: "#D08A1E" },
  high: { label: "High", bg: "rgba(199,38,59,.1)", color: "var(--danger)", stripe: "#D6455A" },
  critical: { label: "Critical", bg: "var(--danger)", color: "#fff", stripe: "#8E1426" },
};

const STATUS_STYLE: Record<BugStatus, { label: string; tint: string; soft: string }> = {
  open: { label: "Open", tint: "#C7263B", soft: "rgba(199,38,59,.10)" },
  in_progress: { label: "In progress", tint: "#B25E00", soft: "rgba(178,94,0,.10)" },
  resolved: { label: "Resolved", tint: "#1E9E5A", soft: "rgba(30,158,90,.12)" },
  closed: { label: "Closed", tint: "#6B7280", soft: "var(--bg-soft)" },
};

const STATUSES: BugStatus[] = ["open", "in_progress", "resolved", "closed"];

/** Six dots — the conventional "grab me" affordance, and small enough to sit
 * beside the title without competing with it. */
function GripIcon() {
  return (
    <svg width="11" height="16" viewBox="0 0 11 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="4" r="1.3" />
      <circle cx="8" cy="4" r="1.3" />
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="3" cy="12" r="1.3" />
      <circle cx="8" cy="12" r="1.3" />
    </svg>
  );
}

/** The card's id, moved through the drag payload. A custom MIME type keeps a
 * card from being dropped into an unrelated drop target (or a text field). */
const DRAG_TYPE = "application/x-bug-id";

/**
 * The bug tracker as a status board: one column per status, cards dragged
 * between them.
 *
 * Dragging is the fast path, not the only one. HTML5 drag-and-drop is
 * pointer-only — there is no keyboard equivalent — so every card also carries
 * ← → buttons that move it one lane at a time. Losing the ability to triage
 * from a keyboard would be a poor trade for the convenience.
 *
 * The four lanes share the width rather than each taking a fixed 300px: at
 * that width the fourth lane fell off the edge of a 1440px screen, and a board
 * whose Closed lane needs a sideways scroll to find does not read as a board.
 * Lanes are full height, so an empty one is still visibly a place to drop into.
 *
 * The whole card is the drag target, but `draggable` on a container makes the
 * browser treat mousedown on its descendants as the start of a drag, which
 * stops the buttons and the select inside from responding at all. So the
 * attribute is turned off while the pointer is over the controls, and back on
 * everywhere else — a small drag target would be the worse trade.
 *
 * A move is optimistic: the card lands in the new column on drop and
 * `useOptimistic` rolls it back by itself if the server rejects the change.
 */
export function BugBoard({
  cards,
  totals,
  perColumn,
  stats,
  filters,
}: {
  cards: Record<BugStatus, BugRow[]>;
  /** Count per status under the current filter — matches what each column shows. */
  totals: Record<BugStatus, number>;
  perColumn: number;
  stats: BugStats;
  filters: BugFilters;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<BugStatus | null>(null);

  const [shownFilters, showFilters] = useOptimistic({
    type: filters.type,
    severity: filters.severity,
  });

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filtered = !!(filters.type || filters.severity || filters.q);

  // Flattened so a move is one list edit rather than a splice across two.
  const all = STATUSES.flatMap((s) => cards[s]);
  const [shown, applyMove] = useOptimistic(all, (rows, move: { id: string; status: BugStatus }) =>
    rows.map((r) => (r.id === move.id ? { ...r, status: move.status } : r)),
  );

  const byStatus = (s: BugStatus) => shown.filter((r) => r.status === s);

  function move(id: string, status: BugStatus) {
    const card = shown.find((r) => r.id === id);
    if (!card || card.status === status) return;
    setError(null);
    startTransition(async () => {
      applyMove({ id, status });
      const res = await setBugStatus(id, status);
      // The optimistic row reverts when the transition settles, so a failure
      // puts the card back where it came from on its own; this only explains
      // why.
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  const empty = shown.length === 0;

  return (
    <div>
      {/* Summary of the whole tracker. Deliberately NOT narrowed by the filter
          below: these answer "how big is the backlog", and a card labelled
          "Features" reading 0 because you filtered to bugs would be noise.
          The column headers are the filtered numbers. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("Bugs")} value={stats.bugs} icon="🐞" tint="#C7263B" />
        <Stat label={t("Features")} value={stats.features} icon="💡" tint="#B9812E" />
        <Stat label={t("Open")} value={stats.open} tint={STATUS_STYLE.open.tint} />
        <Stat label={t("In progress")} value={stats.inProgress} tint={STATUS_STYLE.in_progress.tint} />
        <Stat label={t("Resolved")} value={stats.resolved} tint={STATUS_STYLE.resolved.tint} />
        <Stat
          label={t("Critical unresolved")}
          value={stats.criticalOpen}
          tint="#C7263B"
          alert={stats.criticalOpen > 0}
        />
      </div>

      {/* Filters — these DO narrow the board. */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
        <div
          className="inline-flex gap-0.5 rounded-full p-[3px] transition-opacity"
          style={{ background: "var(--bg-soft)", opacity: pending ? 0.72 : 1 }}
        >
          {([null, "bug", "feature"] as const).map((k) => {
            const active = shownFilters.type === k;
            return (
              <button
                key={k ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  startTransition(() => {
                    showFilters({ ...shownFilters, type: k });
                    push({ type: k });
                  })
                }
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--ink-2)",
                }}
              >
                {k === null ? t("All") : k === "bug" ? `🐞 ${t("Bugs")}` : `💡 ${t("Features")}`}
              </button>
            );
          })}
        </div>

        <select
          className="inp transition-opacity"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12, opacity: pending ? 0.72 : 1 }}
          value={shownFilters.severity ?? "all"}
          onChange={(e) => {
            const next = e.target.value === "all" ? null : (e.target.value as BugSeverity);
            startTransition(() => {
              showFilters({ ...shownFilters, severity: next });
              push({ severity: next });
            });
          }}
          aria-label={t("Severity")}
        >
          <option value="all">{t("All severities")}</option>
          {SEVERITIES.map((sv) => (
            <option key={sv} value={sv}>
              {t(SEVERITY_STYLE[sv].label)}
            </option>
          ))}
        </select>

        <SearchInput
          param="q"
          initial={filters.q}
          style={{ padding: "6px 10px", fontSize: 12, minWidth: 200 }}
          placeholder={t("Search title or description…")}
        />

        {filtered && (
          <button
            type="button"
            className="link text-[12px]"
            onClick={() =>
              startTransition(() => {
                showFilters({ type: null, severity: null });
                push({ type: null, severity: null, q: null });
              })
            }
          >
            {t("Clear filters")}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {empty ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          {filtered ? t("No reports match — try clearing the filter.") : `${t("No reports yet")}.`}
        </p>
      ) : (
        // The lanes share the width, down to a floor that keeps a card
        // readable; below that (a narrow window, a phone) the board scrolls
        // sideways instead of squeezing four lanes into slivers.
        <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: `repeat(${STATUSES.length}, minmax(250px, 1fr))` }}
          >
          {STATUSES.map((s) => {
            const rows = byStatus(s);
            const style = STATUS_STYLE[s];
            const capped = totals[s] > perColumn;
            return (
              <section
                key={s}
                className="flex flex-col overflow-hidden rounded-2xl border transition-colors"
                style={{
                  // A fixed lane height, not one that shrinks to its cards: an
                  // empty lane still has to look like somewhere to drop.
                  height: "max(420px, calc(100dvh - 300px))",
                  background: dragOver === s ? style.soft : "var(--bg-soft)",
                  // Every edge set on its own. A `borderTop` shorthand beside
                  // a changing `borderColor` makes React drop one of them on
                  // rerender, and the lane's colour band vanished after a drag.
                  borderStyle: "solid",
                  borderWidth: "3px 1px 1px 1px",
                  borderTopColor: style.tint,
                  // The drop target has to be legible mid-drag, when the
                  // pointer is over a lane but the card is still elsewhere.
                  borderRightColor: dragOver === s ? style.tint : "var(--hairline-soft)",
                  borderBottomColor: dragOver === s ? style.tint : "var(--hairline-soft)",
                  borderLeftColor: dragOver === s ? style.tint : "var(--hairline-soft)",
                }}
                onDragOver={(e) => {
                  // Without preventDefault the browser refuses the drop.
                  if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOver !== s) setDragOver(s);
                  }
                }}
                onDragLeave={(e) => {
                  // Leaving for a child element still fires dragleave, so only
                  // clear when the pointer has actually left the section.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOver((cur) => (cur === s ? null : cur));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData(DRAG_TYPE);
                  if (id) move(id, s);
                }}
              >
                <div
                  className="flex flex-none items-center gap-2 border-b px-3.5 py-2.5"
                  style={{ borderColor: "var(--hairline-soft)", background: "var(--surface)" }}
                >
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: style.tint }} />
                  <span
                    className="flex-1 text-[12px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {t(style.label)}
                  </span>
                  <span
                    className="flex-none rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ background: style.soft, color: style.tint }}
                  >
                    {totals[s]}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {rows.length === 0 ? (
                    // Fills the lane, so the whole empty lane is visibly the
                    // drop zone rather than a small box at the top of it.
                    <div
                      className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed px-3 text-center text-[12px]"
                      style={{
                        borderColor: dragOver === s ? style.tint : "var(--hairline)",
                        color: dragOver === s ? style.tint : "var(--ink-3)",
                      }}
                    >
                      {dragOver === s ? t("Drop to move here") : t("No reports")}
                    </div>
                  ) : (
                    rows.map((r) => (
                      <BugCard key={r.id} report={r} onMove={move} busy={pending} />
                    ))
                  )}
                  {capped && (
                    <p className="px-1 py-2 text-center text-[11px]" style={{ color: "var(--ink-3)" }}>
                      {t("Showing")} {rows.length} {t("of")} {totals[s]}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tint,
  alert,
}: {
  label: string;
  value: number;
  icon?: string;
  tint: string;
  /** Draws the eye when the number is one somebody has to act on. */
  alert?: boolean;
}) {
  return (
    <div
      className="card flex items-center gap-3 px-4 py-3"
      style={alert ? { borderColor: tint, boxShadow: `inset 3px 0 0 ${tint}` } : undefined}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-[15px]"
        style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
      >
        {icon ?? <span className="h-2.5 w-2.5 rounded-full" style={{ background: tint }} />}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }}>
          {label}
        </div>
        <div
          className="text-[22px] font-bold leading-tight tabular-nums"
          style={{ fontFamily: "var(--font-display)", color: alert ? tint : "var(--ink-1)" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function BugCard({
  report: r,
  onMove,
  busy,
}: {
  report: BugRow;
  onMove: (id: string, status: BugStatus) => void;
  busy: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [loadingShot, setLoadingShot] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Off while the pointer sits over the footer controls, so a click on the
  // Details button or the select is a click and not the start of a drag.
  const [canDrag, setCanDrag] = useState(true);
  const cardRef = useRef<HTMLElement>(null);

  const sev = SEVERITY_STYLE[r.severity];
  const idx = STATUSES.indexOf(r.status);

  /**
   * Open the details and pull the screenshot in the same gesture.
   *
   * The screenshot used to sit behind its own second link, so seeing a report
   * cost two clicks. It is still fetched on demand rather than shipped with the
   * board — a screenshot can be ~1MB and most cards are never opened — but the
   * demand is now "the reader opened this card", not a separate decision.
   *
   * Loaded here rather than in an effect so expanding is one state change.
   */
  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && r.hasScreenshot && shot === null && !loadingShot) {
      setLoadingShot(true);
      getBugScreenshot(r.id)
        .then(setShot)
        .finally(() => setLoadingShot(false));
    }
  }

  return (
    <article
      ref={cardRef}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, r.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={`card flex-none p-3 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        opacity: dragging ? 0.4 : busy ? 0.7 : 1,
        borderLeft: `4px solid ${sev.stripe}`,
      }}
      title={canDrag ? t("Drag to move") : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="flex-none pt-0.5" style={{ color: "var(--ink-3)", lineHeight: 1 }} aria-hidden>
          <GripIcon />
        </span>
        <span className="flex-none text-[14px]" aria-hidden>
          {r.type === "bug" ? "🐞" : "💡"}
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
          {r.title}
        </span>
        <span
          className="flex-none rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: sev.bg, color: sev.color }}
        >
          {t(sev.label)}
        </span>
      </div>

      <div className="mt-1 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {r.reporterName ?? t("Unknown")} · {r.whenLabel}
      </div>
      {r.page && (
        <div className="truncate text-[11.5px]" style={{ color: "var(--ink-3)" }} title={r.page}>
          {r.page}
        </div>
      )}

      {/* Drag is suspended over this block. Without it the browser starts a
          drag on mousedown and the click never lands — which is exactly how
          the Details button and the select stopped working the first time. */}
      <div onMouseEnter={() => setCanDrag(false)} onMouseLeave={() => setCanDrag(true)}>
      <div className="mt-2 flex items-center justify-between gap-2">
        {r.description || r.hasScreenshot ? (
          <button
            type="button"
            className="link text-[11.5px]"
            onClick={toggleOpen}
            aria-expanded={open}
          >
            {open ? t("Less") : r.hasScreenshot ? t("Details + screenshot") : t("Details")}
          </button>
        ) : (
          <span />
        )}

        {/* The keyboard path to the same move as a drag: one lane left or
            right. Dragging is pointer-only, so these are not a fallback but
            the accessible equivalent — and far lighter on a card than the
            full-width status dropdown they replace. */}
        <span className="flex flex-none gap-1">
          <MoveButton
            to={STATUSES[idx - 1]}
            direction="left"
            disabled={busy || idx === 0}
            onMove={(to) => onMove(r.id, to)}
          />
          <MoveButton
            to={STATUSES[idx + 1]}
            direction="right"
            disabled={busy || idx === STATUSES.length - 1}
            onMove={(to) => onMove(r.id, to)}
          />
        </span>
      </div>

      {open && (
        <>
          {r.description && (
            <p className="mt-1.5 whitespace-pre-wrap text-[12px]" style={{ color: "var(--ink-2)" }}>
              {r.description}
            </p>
          )}
          {r.hasScreenshot && (
            <div className="mt-1.5">
              {loadingShot && (
                <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {t("Loading…")}
                </span>
              )}
              {shot && (
                // Opens in a tab because a column is 300px wide and a real
                // screenshot is not.
                <a href={shot} target="_blank" rel="noopener noreferrer" title={t("Open full size")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot}
                    alt={t("Reported screenshot")}
                    // max-w, not w-full: a small screenshot stays its own size
                    // instead of being upscaled into a blur.
                    className="max-w-full rounded-lg border"
                    style={{ borderColor: "var(--hairline-soft)" }}
                  />
                </a>
              )}
            </div>
          )}
        </>
      )}

      </div>
    </article>
  );
}

/** One lane left or right. Named for where it goes — "Move to In progress" —
 * so a screen reader says the destination, not just "previous". */
function MoveButton({
  to,
  direction,
  disabled,
  onMove,
}: {
  to: BugStatus | undefined;
  direction: "left" | "right";
  disabled: boolean;
  onMove: (to: BugStatus) => void;
}) {
  const t = useT();
  const label = to ? `${t("Move to")} ${t(STATUS_STYLE[to].label)}` : undefined;
  return (
    <button
      type="button"
      className="flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-30"
      style={{ borderColor: "var(--hairline)", color: to ? STATUS_STYLE[to].tint : "var(--ink-3)" }}
      disabled={disabled || !to}
      onClick={() => to && onMove(to)}
      aria-label={label}
      title={label}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
      </svg>
    </button>
  );
}
