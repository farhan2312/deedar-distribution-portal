"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AccessRole } from "@/db/schema";
import {
  breadcrumbForPath,
  navItemForPath,
  NAV_SECTIONS,
  ROLE_THEME,
  sectionForPath,
  themeVars,
} from "@/lib/portal/nav";
import { useT } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/language-toggle";
import { NavIconView } from "./nav-icons";
import { MobileNav } from "./mobile-nav";
import { ProfileMenu } from "./profile-menu";
import { ReportBug } from "./report-bug";
import { LiveLocationPill } from "./live-location-pill";
import { BugBell } from "./bug-bell";
import type { BugInbox } from "@/lib/bugs/notifications";

type PortalShellProps = {
  userName: string;
  phone: string;
  roleLabel: string;
  accessRoles: AccessRole[];
  /** True while a field rep's day is open — drives live-location sharing. */
  trackingActive: boolean;
  /** Bug reports awaiting triage (admin) or filed by this user (everyone else). */
  bugInbox: BugInbox;
  /** True for admin-created accounts still on their phone-number password —
   * they're pinned to /account/change-password until they set a new one. */
  mustChangePassword: boolean;
  children: React.ReactNode;
};

/** The one route a forced user may stay on. */
const CHANGE_PASSWORD_PATH = "/account/change-password";


export function PortalShell({ userName, phone, roleLabel, accessRoles, trackingActive, bugInbox, mustChangePassword, children }: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  // A forced-reset user is pinned to the change-password screen: any other route
  // bounces back to it, so they can't use the app until the password is changed
  // (which clears the flag server-side). Server-enforced too — every mutation
  // still runs its own auth — this is the UX gate.
  const mustRedirect = mustChangePassword && !pathname.startsWith(CHANGE_PASSWORD_PATH);
  useEffect(() => {
    if (mustRedirect) router.replace(CHANGE_PASSWORD_PATH);
  }, [mustRedirect, router]);

  if (mustRedirect) {
    return (
      <div className="flex h-dvh items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Redirecting…")}</p>
      </div>
    );
  }
  const roleSet = new Set(accessRoles);
  // Admin is unrestricted: it sees every sidebar section, not just "admin".
  const isAdmin = roleSet.has("admin");
  const sections = NAV_SECTIONS.filter((s) => isAdmin || roleSet.has(s.role));
  const section = sectionForPath(pathname);
  const crumb = breadcrumbForPath(pathname);
  // Every sidebar-listed page gets the same icon + title header, sourced from
  // the nav config so a page can never drift from its sidebar entry. Routes
  // with no nav entry (/dashboard, /account/*, counter detail pages) render
  // their own bespoke headers instead.
  const navItem = navItemForPath(pathname);

  // Root uses `h-dvh`, not `h-screen`: on iOS Safari `100vh` is taller than the
  // visible area while the URL bar is showing, which pushes the bottom of the
  // app out of view. The dynamic viewport unit tracks the real height.
  return (
    <div
      className="role-scope flex h-dvh"
      style={{ background: "var(--bg)", ...themeVars(ROLE_THEME[section]) }}
    >
      {/* Sidebar — header and footer stay fixed, only the nav list scrolls.
          Below `md` it's replaced by MobileNav's bottom bar. */}
      <aside className="sidebar-glass hidden w-[250px] flex-none flex-col overflow-hidden py-5 md:flex">
        <div className="flex flex-none items-center gap-2.5 px-5 pb-4">
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[15px] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            D
          </span>
          <div>
            <div
              className="text-[15px] font-bold leading-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Deedar Drive
            </div>
            <div className="text-[10.5px] leading-tight" style={{ color: "rgba(241,247,242,.5)" }}>
              {t("Distribution Portal")}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav min-h-0 flex-1 overflow-y-auto">
          {sections.map((sec) => {
            const theme = ROLE_THEME[sec.role];
            return (
              <div key={sec.role}>
                <div className="flex items-center gap-1.5 px-5 pb-1.5 pt-3.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: theme.dot }}
                  />
                  <span
                    className="text-[11px] font-bold uppercase"
                    style={{ letterSpacing: ".06em", color: theme.dot }}
                  >
                    {t(sec.title)}
                  </span>
                </div>
                {sec.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      // --nav-rgb lets the active pill glow in THIS section's
                      // colour, even though the page accent follows the route.
                      className={`mx-3 my-0.5 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-all ${
                        active ? "nav-active" : "nav-idle"
                      }`}
                      style={
                        {
                          "--nav-rgb": theme.rgb,
                          color: active ? "#fff" : theme.muted,
                        } as React.CSSProperties
                      }
                    >
                      <NavIconView icon={item.icon} className="h-4 w-4 flex-none" />
                      {t(item.label)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <ProfileMenu userName={userName} phone={phone} roleLabel={roleLabel} />
      </aside>

      {/* Main content — recolored per role section (vars set on the root) */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* Top bar — breadcrumb left, language + bug report right */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-2.5 md:gap-3 md:px-8 md:py-3"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--hairline-soft)",
          }}
        >
          {/* The sidebar carries the brand on desktop; on mobile it's hidden, so
              the top bar shows the mark instead of the breadcrumb. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
            <span
              className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              D
            </span>
            <span
              className="truncate text-[14px] font-bold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
            >
              Deedar
            </span>
          </div>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-[13px] md:flex">
            <span style={{ color: "var(--ink-3)" }}>{t(crumb.section)}</span>
            <span style={{ color: "var(--ink-3)" }}>›</span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {t(crumb.page)}
            </span>
          </nav>
          {/* flex-none so the actions never compress; the brand truncates instead. */}
          <div className="flex flex-none items-center gap-1.5 md:gap-3">
            <LiveLocationPill active={trackingActive} />
            <LanguageToggle />
            <ReportBug />
            <BugBell initial={bugInbox} />
          </div>
        </div>
        {/* Wide by default so tables/dashboards use the body; narrow pages
            (New Counter, Beat, forms) self-center via their own `mx-auto max-w-*`. */}
        {/* pb clears the fixed bottom nav on mobile (bar height + safe area). */}
        <div className="mx-auto max-w-[1600px] px-4 pb-28 pt-5 md:px-8 md:pb-8 md:pt-8">
          {navItem && !navItem.customHeader && (
            <div className="mb-5 md:mb-6">
              <h1 className="page-title">{t(navItem.label)}</h1>
              {navItem.blurb && <p className="page-subtitle max-w-2xl">{t(navItem.blurb)}</p>}
            </div>
          )}
          {children}
        </div>
      </main>

      <MobileNav
        sections={sections}
        activeRole={section}
        pathname={pathname}
        userName={userName}
        phone={phone}
        roleLabel={roleLabel}
      />
    </div>
  );
}
