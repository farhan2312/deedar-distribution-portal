"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccessRole } from "@/db/schema";
import {
  NAV_SECTIONS,
  ROLE_THEME,
  sectionForPath,
  themeVars,
} from "@/lib/portal/nav";
import { useT } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/language-toggle";
import { NavIconView } from "./nav-icons";
import { ProfileMenu } from "./profile-menu";

type PortalShellProps = {
  userName: string;
  phone: string;
  roleLabel: string;
  accessRoles: AccessRole[];
  children: React.ReactNode;
};

export function PortalShell({ userName, phone, roleLabel, accessRoles, children }: PortalShellProps) {
  const pathname = usePathname();
  const t = useT();
  const roleSet = new Set(accessRoles);
  // Admin is unrestricted: it sees every sidebar section, not just "admin".
  const isAdmin = roleSet.has("admin");
  const sections = NAV_SECTIONS.filter((s) => isAdmin || roleSet.has(s.role));
  const section = sectionForPath(pathname);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar — header and footer stay fixed, only the nav list scrolls */}
      <aside
        className="flex w-[250px] flex-none flex-col overflow-hidden py-5"
        style={{
          background: "#0A0A0A",
          boxShadow: "4px 0 24px rgba(30,20,5,.14)",
        }}
      >
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
                      className="mx-3 my-px flex items-center gap-2.5 rounded-[12px] px-3.5 py-2 text-[14px] font-semibold transition-all"
                      style={{
                        background: active ? theme.bg : "transparent",
                        color: active ? theme.strong : theme.muted,
                        boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                      }}
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

        <div className="flex flex-none justify-center px-5 pb-1 pt-3">
          <LanguageToggle variant="dark" />
        </div>
        <ProfileMenu userName={userName} phone={phone} roleLabel={roleLabel} />
      </aside>

      {/* Main content — recolored per role section */}
      <main
        className="flex-1 overflow-y-auto px-8 py-8"
        style={themeVars(ROLE_THEME[section])}
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
