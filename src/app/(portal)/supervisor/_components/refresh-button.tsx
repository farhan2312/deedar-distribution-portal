"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/**
 * Re-runs the current route's server component for the same URL/params —
 * `router.refresh()` re-fetches the analytics data (rep visits, deltas, trend)
 * without touching the date/depot filters or losing scroll position on the
 * rest of the page. Sits in the same row as the date picker since "as of
 * when" and "get me the latest" are the same mental action for the viewer.
 */
export function RefreshButton() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label={t("Refresh")}
      title={t("Refresh")}
      className="inp flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
    >
      <RefreshIcon className="h-3.5 w-3.5" spinning={pending} />
      <span className="hidden sm:inline">{t("Refresh")}</span>
    </button>
  );
}

function RefreshIcon({ className, spinning }: { className?: string; spinning?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spinning ? { animation: "spin .7s linear infinite" } : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
