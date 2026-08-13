"use client";

import { useLocationReporter } from "@/lib/tracking/use-location-reporter";
import { useT } from "@/lib/i18n/provider";

/**
 * Compact live-location indicator for the top bar. This is the ONLY place
 * `useLocationReporter` is mounted — it lives in the portal shell so the rep
 * keeps streaming while they move between Beat, New Counter, a visit form,
 * etc. Mounting it on a page as well would open a second socket.
 *
 * Renders nothing unless the rep's day is open.
 */
export function LiveLocationPill({ active }: { active: boolean }) {
  const t = useT();
  const { state, lastSentAt } = useLocationReporter(active);

  if (!active) return null;

  const style = {
    live: { label: t("Sharing location"), bg: "rgba(30,158,90,.12)", color: "#1E9E5A", pulse: true },
    connecting: { label: t("Connecting…"), bg: "rgba(224,177,92,.2)", color: "#B25E00", pulse: false },
    denied: { label: t("Location blocked"), bg: "rgba(199,38,59,.1)", color: "#C7263B", pulse: false },
    error: { label: t("Location unavailable"), bg: "rgba(199,38,59,.1)", color: "#C7263B", pulse: false },
    blocked: { label: t("Shared on another device"), bg: "var(--bg-soft)", color: "var(--ink-3)", pulse: false },
    off: { label: t("Off"), bg: "var(--bg-soft)", color: "var(--ink-3)", pulse: false },
  }[state];

  const time = lastSentAt
    ? new Date(lastSentAt).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: style.bg }}
      title={
        state === "denied"
          ? t("Allow location access so your Sales Officer can see your position.")
          : state === "blocked"
            ? t("You started today's day on another device — location is shared from there.")
            : t("Your Sales Officer can see you on the map while your day is open.")
      }
    >
      <PinIcon className="h-3.5 w-3.5 flex-none" style={{ color: style.color }} />
      <span className="text-[11.5px] font-semibold whitespace-nowrap" style={{ color: style.color }}>
        {style.label}
      </span>
      {time && (
        <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: style.color, opacity: 0.75 }}>
          · {time}
        </span>
      )}
      {style.pulse && (
        <span
          className="h-1.5 w-1.5 flex-none rounded-full"
          style={{ background: style.color, animation: "pulseDot 1.6s ease-in-out infinite" }}
        />
      )}
    </span>
  );
}

function PinIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
