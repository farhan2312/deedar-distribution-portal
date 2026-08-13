"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccessRole } from "@/db/schema";
import {
  breadcrumbForPath,
  NAV_SECTIONS,
  ROLE_THEME,
  sectionForPath,
  themeVars,
} from "@/lib/portal/nav";
import { useT } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/language-toggle";
import { NavIconView } from "./nav-icons";
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
  children: React.ReactNode;
};

export function PortalShell({ userName, phone, roleLabel, accessRoles, trackingActive, bugInbox, children }: PortalShellProps) {
  const pathname = usePathname();
  const t = useT();
  const roleSet = new Set(accessRoles);
  // Admin is unrestricted: it sees every sidebar section, not just "admin".
  const isAdmin = roleSet.has("admin");
  const sections = NAV_SECTIONS.filter((s) => isAdmin || roleSet.has(s.role));
  const section = sectionForPath(pathname);
  const crumb = breadcrumbForPath(pathname);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)", ...themeVars(ROLE_THEME[section]) }}>
      {/* Sidebar — header and footer stay fixed, only the nav list scrolls */}
      <aside className="sidebar-glass flex w-[250px] flex-none flex-col overflow-hidden py-5">
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
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-8 py-3"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--hairline-soft)",
          }}
        >
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
            <span style={{ color: "var(--ink-3)" }}>{t(crumb.section)}</span>
            <span style={{ color: "var(--ink-3)" }}>›</span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {t(crumb.page)}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <LiveLocationPill active={trackingActive} />
            <LanguageToggle />
            <ReportBug />
            <BugBell initial={bugInbox} />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
