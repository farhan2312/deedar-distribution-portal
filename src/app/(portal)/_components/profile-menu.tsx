"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { useTheme } from "@/lib/theme/use-theme";
import { useT } from "@/lib/i18n/provider";

export function ProfileMenu({
  userName,
  phone,
  roleLabel,
}: {
  userName: string;
  phone: string;
  roleLabel: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = userName.charAt(0).toUpperCase();
  const { isDark, toggle } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-3 flex-none px-3 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
      {open && (
        <div
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl"
          style={{ background: "#161616", border: "1px solid rgba(255,255,255,.08)", boxShadow: "var(--shadow-lg)" }}
        >
          {/* Account header */}
          <div className="px-4 py-3.5">
            <div className="truncate text-[13.5px] font-bold text-white">{userName}</div>
            <div className="truncate text-[12px]" style={{ color: "rgba(241,247,242,.5)" }}>{phone}</div>
          </div>
          <Divider />

          {/* Dark mode */}
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={toggle}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2.5 text-[13px] font-medium" style={{ color: "rgba(241,247,242,.75)" }}>
              <MoonIcon className="h-4 w-4 flex-none" />
              {t("Dark mode")}
            </span>
            <span
              className="inline-flex h-[18px] w-[32px] flex-none items-center rounded-full px-[3px] transition-colors"
              style={{ background: isDark ? "var(--accent)" : "rgba(255,255,255,.12)" }}
            >
              <span
                className="h-3 w-3 rounded-full transition-transform"
                style={{
                  background: isDark ? "#fff" : "rgba(241,247,242,.4)",
                  transform: isDark ? "translateX(14px)" : "none",
                }}
              />
            </span>
          </button>
          <Divider />

          {/* Change password */}
          <Link
            href="/account/change-password"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium transition-colors"
            style={{ color: "rgba(241,247,242,.85)" }}
          >
            <LinkIcon className="h-4 w-4 flex-none" />
            {t("Change Password")}
          </Link>
          <Divider />

          {/* Sign out */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-semibold transition-colors"
              style={{ color: "#F08A8A" }}
            >
              <SignOutIcon className="h-4 w-4 flex-none" />
              {t("Sign out")}
            </button>
          </form>
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 pb-3.5 text-left"
        aria-expanded={open}
      >
        <span
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: "rgba(255,255,255,.12)" }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium" style={{ color: "rgba(241,247,242,.85)" }}>
            {userName}
          </div>
          <div className="truncate text-[11px]" style={{ color: "rgba(241,247,242,.5)" }}>
            {t(roleLabel)}
          </div>
        </div>
        <ChevronIcon className="h-4 w-4 flex-none transition-transform" style={{ color: "rgba(241,247,242,.5)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid rgba(255,255,255,.08)" }} />;
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7a5 5 0 0 1 0-10h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
