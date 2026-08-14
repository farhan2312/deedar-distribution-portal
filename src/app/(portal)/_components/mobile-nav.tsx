"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { ROLE_THEME, type NavItem, type NavSection } from "@/lib/portal/nav";
import { useT } from "@/lib/i18n/provider";
import { useTheme } from "@/lib/theme/use-theme";
import { NavIconView } from "./nav-icons";

/**
 * Bottom navigation for small screens — the sidebar is hidden below `md` and
 * this takes over.
 *
 * A phone bar fits ~5 targets, but a user can have far more (an admin sees every
 * section, ~20 items). So the bar shows the CURRENT section's first four items —
 * the ones you actually reach for on the screen you're on — and a "More" tab
 * that opens a sheet with every section, plus the account actions that live in
 * the sidebar footer on desktop.
 */
const MAX_TABS = 4;

export function MobileNav({
  sections,
  activeRole,
  pathname,
  userName,
  phone,
  roleLabel,
}: {
  /** Sections this user can see, already role-filtered by the shell. */
  sections: NavSection[];
  /** Role section the current route belongs to — picks the bar's tabs. */
  activeRole: string;
  pathname: string;
  userName: string;
  phone: string;
  roleLabel: string;
}) {
  const t = useT();
  const { isDark, toggle } = useTheme();
  // The sheet belongs to the route it was opened on, so "open" is DERIVED from
  // the pathname rather than stored as a boolean cleared by an effect: it then
  // closes on any navigation (taps, and browser back) for free, and React 19's
  // lint rightly forbids the synchronous setState-in-effect that would need.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const sheetOpen = openedOn === pathname;
  const closeSheet = () => setOpenedOn(null);

  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenedOn(null);
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const current = sections.find((s) => s.role === activeRole) ?? sections[0];
  const tabs: NavItem[] = (current?.items ?? []).slice(0, MAX_TABS);
  // "More" is always present: it's the only route to the account actions, and
  // to any section beyond the one you're in.
  const moreActive = sheetOpen || !tabs.some((item) => isActive(item.href));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch md:hidden"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--hairline)",
          boxShadow: "0 -4px 20px rgba(20,16,50,.08)",
          paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        }}
      >
        {tabs.map((item) => (
          <MobileTab
            key={item.href}
            href={item.href}
            label={t(item.label)}
            active={isActive(item.href)}
            icon={<NavIconView icon={item.icon} className="h-[19px] w-[19px]" />}
          />
        ))}
        <MobileTab
          label={t("More")}
          active={moreActive}
          onClick={() => setOpenedOn(pathname)}
          icon={<GridIcon className="h-[19px] w-[19px]" />}
        />
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <button
            type="button"
            aria-label={t("Close menu")}
            onClick={() => closeSheet()}
            className="sheet-backdrop absolute inset-0"
            style={{ background: "rgba(15,12,40,.45)", animation: "fadeIn .2s ease" }}
          />
          <div
            className="sheet-panel relative flex max-h-[82vh] flex-col overflow-hidden rounded-t-3xl"
            style={{
              background: "var(--surface)",
              animation: "sheetUp .26s cubic-bezier(.32,.72,0,1)",
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}
          >
            <div className="flex flex-none justify-center pb-1 pt-2.5">
              <span className="h-1 w-9 rounded-full" style={{ background: "var(--hairline)" }} />
            </div>

            <div className="flex flex-none items-center gap-3 px-5 pb-3.5 pt-1.5">
              <span
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[14px] font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {userName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold" style={{ color: "var(--ink-1)" }}>
                  {userName}
                </div>
                <div className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {roleLabel} · {phone}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("Close menu")}
                onClick={() => closeSheet()}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full"
                style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
              {sections.map((sec) => {
                const theme = ROLE_THEME[sec.role];
                return (
                  <div key={sec.role} className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.strong }} />
                      <span
                        className="text-[11px] font-bold uppercase"
                        style={{ letterSpacing: ".06em", color: theme.strong }}
                      >
                        {t(sec.title)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {sec.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => closeSheet()}
                            className="flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors"
                            style={{
                              borderColor: active ? theme.strong : "var(--hairline)",
                              background: active ? theme.bg : "var(--surface)",
                              color: active ? theme.strong : "var(--ink-2)",
                            }}
                          >
                            <NavIconView icon={item.icon} className="h-5 w-5" />
                            <span className="text-[11px] font-semibold leading-tight">{t(item.label)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dark mode lives here on phones — the sidebar (and its profile
                menu) is hidden below `md`, so this is the only way to reach it. */}
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              onClick={toggle}
              className="mx-5 mb-1 flex flex-none items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left"
              style={{ borderColor: "var(--hairline)" }}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--ink-2)" }}>
                <MoonIcon className="h-4 w-4" />
                {t("Dark mode")}
              </span>
              <span
                className="inline-flex h-[20px] w-[36px] flex-none items-center rounded-full px-[3px] transition-colors"
                style={{ background: isDark ? "var(--accent)" : "var(--hairline)" }}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full transition-transform"
                  style={{ background: "#fff", transform: isDark ? "translateX(16px)" : "none" }}
                />
              </span>
            </button>

            <div
              className="flex flex-none items-center gap-2 px-5 pt-3"
              style={{ borderTop: "1px solid var(--hairline-soft)" }}
            >
              <Link
                href="/account/change-password"
                onClick={() => closeSheet()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-semibold"
                style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
              >
                <KeyIcon className="h-4 w-4" />
                {t("Change Password")}
              </Link>
              <form action={logoutAction} className="flex-1">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-semibold"
                  style={{ borderColor: "rgba(199,38,59,.25)", color: "var(--danger)" }}
                >
                  <SignOutIcon className="h-4 w-4" />
                  {t("Sign out")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** One bar target. Renders as a link, or a button when it opens the sheet. */
function MobileTab({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
        style={{ background: active ? "var(--accent-tint)" : "transparent" }}
      >
        {icon}
      </span>
      <span className="max-w-full truncate text-[10.5px] font-semibold leading-tight">{label}</span>
    </>
  );
  const className =
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-1 pt-2 transition-colors";
  const style = { color: active ? "var(--accent)" : "var(--ink-3)" };

  if (href) {
    return (
      <Link href={href} className={className} style={style} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style} aria-expanded={active}>
      {body}
    </button>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.5 12.5 8-8M16 3l3 3-2.5 2.5" />
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
