"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endDay, startDay } from "@/lib/field/day-log-actions";
import { SEGMENTS, clampQty, totalOf, zeroQty, type SegQty } from "@/lib/field/day-stock";
import { SEGMENT_LABEL } from "@/lib/field/products";
import { getDeviceId } from "@/lib/tracking/device-id";
import { useT } from "@/lib/i18n/provider";
import type { ProductSegment } from "@/db/schema";

export type HistoryRow = {
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  onJobLabel: string;
  pickupTotal: number;
  remainingTotal: number;
};

export function DayLogClient({
  greeting,
  firstName,
  todayLabel,
  started,
  ended,
  startLabel,
  endLabel,
  onJobLabel,
  history,
  daysLoggedThisWeek,
  totalOnJobLabelThisWeek,
  weekPct,
  pickup,
  remaining,
  soldToday,
}: {
  greeting: string;
  firstName: string;
  todayLabel: string;
  started: boolean;
  ended: boolean;
  startLabel: string;
  endLabel: string;
  onJobLabel: string;
  history: HistoryRow[];
  daysLoggedThisWeek: number;
  totalOnJobLabelThisWeek: string;
  weekPct: number;
  /** Per-SKU stock already recorded on today s log, if the step is done. */
  pickup: SegQty;
  remaining: SegQty;
  /** Packets sold per SKU across today s visits — the middle term in
   * picked up − sold = remaining, shown so the rep can sanity-check the count
   * they are about to submit. */
  soldToday: SegQty;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  // Cap the history to the last week — a rep only needs to sanity-check the
  // recent stretch here; deeper history belongs in a report, not this card.
  const HISTORY_WEEK = 7;
  const weekHistory = history.slice(0, HISTORY_WEEK);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const HISTORY_PREVIEW = 5;
  const visibleHistory = showAllHistory ? weekHistory : weekHistory.slice(0, HISTORY_PREVIEW);

  // Which stock panel is open. Only one at a time — the two steps are
  // sequential, so there is never a reason to fill both at once.
  const [openPanel, setOpenPanel] = useState<null | "pickup" | "remaining">(null);
  const [pickupDraft, setPickupDraft] = useState<SegQty>(zeroQty);
  const [remainingDraft, setRemainingDraft] = useState<SegQty>(zeroQty);

  // What the count SHOULD come to if every visit was logged. Shown beside each
  // input as a cross-check, never prefilled — auto-filling it would just have
  // the rep confirm our arithmetic instead of counting what is in the bag,
  // which is the one thing this step exists to capture.
  const expectedRemaining = SEGMENTS.reduce((acc, seg) => {
    acc[seg] = Math.max(0, pickup[seg] - soldToday[seg]);
    return acc;
  }, zeroQty());

  function onStart() {
    const deviceId = getDeviceId();
    start(async () => {
      await startDay(deviceId, pickupDraft);
      setOpenPanel(null);
      router.refresh();
    });
  }
  function onEnd() {
    start(async () => {
      await endDay(remainingDraft);
      setOpenPanel(null);
      router.refresh();
    });
  }

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t(greeting)}, {firstName}! 👋
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>
            {t("Let's track your day and make it count.")}
          </p>
        </div>
        {/* Chevron is decorative only — there's no historical "Today's Plan"
            view to switch to yet, so this pill doesn't open a date picker. */}
        <div
          className="flex items-center gap-2 rounded-full border bg-[var(--surface)] px-4 py-2.5 text-[13.5px] font-semibold"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-1)" }}
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
                {t("Today's Plan")}
              </div>
              <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Log your visit timings for today")}</div>
            </div>
          </div>

          <PlanRow
            icon={<PlayIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
            label={t("Visit Start Time")}
            value={startLabel}
            btnLabel={t("Start")}
            active={!started}
            disabled={started || pending}
            // Starting the day now goes through the stock panel rather than
            // stamping straight away, so the pickup count is captured at the
            // one moment the rep actually knows it.
            onClick={() => setOpenPanel(openPanel === "pickup" ? null : "pickup")}
            stockLabel={t("Stock picked up")}
            stockTotal={started ? totalOf(pickup) : null}
          />
          {openPanel === "pickup" && !started && (
            <StockPanel
              title={t("Stock picked up from your stockist")}
              hint={t("Packets you are carrying out today. Enter 0 for anything you did not take.")}
              qty={pickupDraft}
              onChange={setPickupDraft}
              confirmLabel={pending ? t("Starting…") : t("Start day")}
              onConfirm={onStart}
              onCancel={() => setOpenPanel(null)}
              busy={pending}
              t={t}
            />
          )}

          <PlanRow
            icon={<StopIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
            label={t("Visit End Time")}
            value={endLabel}
            btnLabel={t("End")}
            active={started && !ended}
            disabled={!started || ended || pending}
            onClick={() => setOpenPanel(openPanel === "remaining" ? null : "remaining")}
            stockLabel={t("Stock remaining")}
            stockTotal={ended ? totalOf(remaining) : null}
            last={openPanel !== "remaining"}
          />
          {openPanel === "remaining" && started && !ended && (
            <StockPanel
              title={t("Stock remaining at end of day")}
              hint={t("Packets still with you. Expected = picked up − sold today.")}
              qty={remainingDraft}
              onChange={setRemainingDraft}
              expected={expectedRemaining}
              confirmLabel={pending ? t("Ending…") : t("End day")}
              onConfirm={onEnd}
              onCancel={() => setOpenPanel(null)}
              busy={pending}
              t={t}
              last
            />
          )}

          {started && ended && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
              {t("Day complete")} — {t("On job")}: <strong>{onJobLabel}</strong>
              {" · "}
              {t("Picked up")}: <strong>{totalOf(pickup)}</strong>
              {" · "}
              {t("Sold")}: <strong>{totalOf(soldToday)}</strong>
              {" · "}
              {t("Remaining")}: <strong>{totalOf(remaining)}</strong>
            </p>
          )}

        </div>

        {/* Motivational card — only in the 2-column desktop layout, where it
            fills the side column. Stacked full-width on a phone it's just
            filler, so it's hidden below `lg`. Light accent-tint (not the fixed
            --gradient-cosmic brand-green) so it follows the field section's
            own accent like every other card, instead of always rendering
            green regardless of role. */}
        <div
          className="relative hidden flex-col items-center justify-center overflow-hidden rounded-2xl p-7 text-center lg:flex"
          style={{ background: "var(--accent-tint)", boxShadow: "var(--shadow-sm)" }}
        >
          <LeafDecoration className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24" />
          <ChartFlagIllustration />
          <div className="relative mt-4 text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Every visit counts!")}
          </div>
          <p className="relative mt-2 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("Keep logging your visits and achieve more everyday.")}
          </p>
        </div>
      </div>

      {/* Previous Days */}
      <div className="card mt-5 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <IconBadge>
              <HistoryIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />
            </IconBadge>
            <div>
              <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
                {t("Previous Days")}
              </div>
              <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Your recent visit history")}</div>
            </div>
          </div>
          {weekHistory.length > HISTORY_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllHistory((v) => !v)}
              className="flex items-center gap-1 text-[13px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {showAllHistory ? t("Show less") : t("View all")}
              <ChevronRightIcon className="h-3.5 w-3.5" style={{ transform: showAllHistory ? "rotate(90deg)" : "none" }} />
            </button>
          )}
        </div>

        {weekHistory.length === 0 ? (
          <p className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
            {t("No previous day logs yet.")}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Start time")}</th>
                  <th>{t("End time")}</th>
                  <th>{t("On job")}</th>
                  <th>{t("Picked up")}</th>
                  <th>{t("Remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((h, i) => (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2 font-medium">
                        <CalendarIcon className="h-4 w-4 flex-none" style={{ color: "var(--ink-3)" }} />
                        {h.dateLabel}
                      </div>
                    </td>
                    <td>{h.startLabel}</td>
                    <td>{h.endLabel}</td>
                    <td>
                      {h.onJobLabel !== "—" && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
                          style={{ background: "rgba(30,158,90,.12)", color: "var(--success)" }}
                        >
                          <ClockIcon className="h-3.5 w-3.5" />
                          {h.onJobLabel}
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums">{h.pickupTotal || "—"}</td>
                    <td className="tabular-nums">{h.remainingTotal || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Encouragement banner + this-week stats */}
      <div className="mt-5 flex flex-wrap items-center gap-5 rounded-2xl p-5" style={{ background: "var(--accent-tint)" }}>
        <div className="flex flex-1 items-center gap-4" style={{ minWidth: 220 }}>
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: "var(--accent)" }}>
            <StarIcon className="h-5 w-5 text-white" />
          </span>
          <div>
            <div className="text-[15px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
              {t("Keep up the great work!")}
            </div>
            <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {t("Consistency today leads to success tomorrow.")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 sm:gap-6">
          <BannerStat
            icon={<TargetIcon className="h-[18px] w-[18px]" style={{ color: "var(--accent)" }} />}
            value={String(daysLoggedThisWeek)}
            label={t("Days Logged")}
          />
          <div className="hidden h-9 w-px sm:block" style={{ background: "var(--hairline)" }} />
          <BannerStat
            icon={<ClockIcon className="h-[18px] w-[18px]" style={{ color: "var(--success)" }} />}
            value={totalOnJobLabelThisWeek}
            label={t("Total On Job")}
            pill
          />
          <div className="hidden h-9 w-px sm:block" style={{ background: "var(--hairline)" }} />
          <BannerStat
            icon={<FlameIcon className="h-[18px] w-[18px]" style={{ color: "var(--warning)" }} />}
            value={`${weekPct}%`}
            label={t("This Week")}
          />
        </div>
      </div>
    </div>
  );
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: "var(--accent-tint)" }}>
      {children}
    </span>
  );
}

/**
 * Per-SKU packet count for one end of the day, shown inline under its plan row.
 *
 * Same four SKUs and the same number-input shape as the visit form, so a rep
 * counting stock here is filling in a form they already know. Confirming is
 * what actually starts/ends the day — the timestamp and the count are written
 * together, which is the only way they stay consistent.
 */
function StockPanel({
  title,
  hint,
  qty,
  onChange,
  expected,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  last,
  t,
}: {
  title: string;
  hint: string;
  qty: SegQty;
  onChange: (next: SegQty) => void;
  /** Optional per-SKU cross-check (picked up − sold), shown as a hint. */
  expected?: SegQty;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  last?: boolean;
  t: (key: string) => string;
}) {
  const total = totalOf(qty);

  function setSeg(seg: ProductSegment, raw: string) {
    onChange({ ...qty, [seg]: clampQty(raw) });
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--accent-tint)",
        marginBottom: last ? 0 : 16,
      }}
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h6 className="text-[13.5px] font-bold" style={{ color: "var(--ink-1)" }}>{title}</h6>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
          {total} {t("packets")}
        </span>
      </div>
      <p className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>{hint}</p>

      {SEGMENTS.map((seg) => (
        <div
          key={seg}
          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline-soft)" }}
        >
          <span className="text-[13.5px] font-medium" style={{ color: "var(--ink-1)" }}>
            {t(SEGMENT_LABEL[seg])}
          </span>
          <div className="flex items-center gap-2.5">
            {expected && (
              <span className="text-[11.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                {t("Expected")} {expected[seg]}
              </span>
            )}
            <input
              className="inp text-center"
              type="number"
              min={0}
              inputMode="numeric"
              style={{ width: 72, padding: "8px 6px" }}
              value={qty[seg]}
              onChange={(e) => setSeg(seg, e.target.value)}
            />
          </div>
        </div>
      ))}

      <div className="mt-3.5 flex gap-2.5">
        <button className="btn btn-secondary flex-1 justify-center" onClick={onCancel} disabled={busy}>
          {t("Cancel")}
        </button>
        <button className="btn btn-primary flex-1 justify-center" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </div>
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
  stockLabel,
  stockTotal,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  btnLabel: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  last?: boolean;
  /** Caption for the stock figure recorded at this step. */
  stockLabel?: string;
  /** Recorded packet count, or null while the step is still pending. */
  stockTotal?: number | null;
}) {
  return (
    <div className="flex items-center justify-between py-4" style={{ borderBottom: last ? "none" : "1px solid var(--hairline-soft)" }}>
      <div className="flex items-center gap-3.5">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          {icon}
        </span>
        <div>
          <div className="text-[14.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{label}</div>
          <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {value}
            {stockTotal != null && (
              <>
                {" · "}
                {stockLabel}: <strong style={{ color: "var(--ink-2)" }}>{stockTotal}</strong>
              </>
            )}
          </div>
        </div>
      </div>
      <button
        className="btn"
        style={{ background: active ? "var(--accent)" : "var(--accent-tint)", color: active ? "#fff" : "var(--accent)" }}
        onClick={onClick}
        disabled={disabled}
      >
        {btnLabel}
      </button>
    </div>
  );
}

/** Ascending-bars + flag, in a soft accent-tinted circle — the light-card
 * counterpart to the old white-on-green TrendIllustration. Every fill derives
 * from --accent, so it recolours with the role theme instead of being a fixed
 * brand colour. */
function ChartFlagIllustration() {
  return (
    <svg width="112" height="80" viewBox="0 0 112 80" fill="none" className="relative">
      <circle cx="56" cy="42" r="36" fill="rgba(var(--accent-rgb), .14)" />
      <circle cx="18" cy="16" r="2.5" fill="var(--accent)" opacity=".45" />
      <circle cx="96" cy="20" r="2" fill="var(--accent)" opacity=".4" />
      <circle cx="90" cy="62" r="2" fill="var(--accent)" opacity=".35" />
      <rect x="27" y="48" width="9" height="18" rx="2" fill="var(--accent)" opacity=".5" />
      <rect x="41" y="40" width="9" height="26" rx="2" fill="var(--accent)" opacity=".68" />
      <rect x="55" y="30" width="9" height="36" rx="2" fill="var(--accent)" opacity=".85" />
      <rect x="69" y="22" width="9" height="44" rx="2" fill="var(--accent)" />
      <line x1="73.5" y1="22" x2="73.5" y2="10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M73.5 10 87 14.5 73.5 19Z" fill="var(--accent)" />
    </svg>
  );
}

/** Subtle two-leaf corner accent for the motivational card — decorative only,
 * low-opacity so it never competes with the text above it. */
function LeafDecoration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none">
      <path d="M40 78S20 60 20 38c0-14 10-24 24-24 0 20-4 64-4 64Z" fill="var(--accent)" opacity=".16" />
      <path d="M40 78S60 66 64 46c2-12-4-22-16-24-2 20-8 56-8 56Z" fill="var(--accent)" opacity=".1" />
    </svg>
  );
}

function BannerStat({
  icon,
  value,
  label,
  pill,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  /** Total On Job reads as a status ("time earned"), not a plain count, so its
   * value gets the same green success-pill treatment as an "on job" duration
   * anywhere else in the app — Days Logged/This Week stay plain numbers. */
  pill?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: "var(--surface)" }}>
        {icon}
      </span>
      <div>
        {pill ? (
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums"
            style={{ fontFamily: "var(--font-display)", background: "rgba(30,158,90,.12)", color: "var(--success)" }}
          >
            {value}
          </span>
        ) : (
          <div className="text-[15px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {value}
          </div>
        )}
        <div className="mt-0.5 text-[11px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>{label}</div>
      </div>
    </div>
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

function ChevronDownIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function TargetIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ClockIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function FlameIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5.2 1.2 1 2 1 2C9 8 10 5 12 2Z" />
    </svg>
  );
}
