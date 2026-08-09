"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccessRole } from "@/db/schema";
import { logoutAction } from "@/lib/auth/actions";
import {
  NAV_SECTIONS,
  ROLE_THEME,
  sectionForPath,
  themeVars,
} from "@/lib/portal/nav";

type PortalShellProps = {
  userName: string;
  accessRoles: AccessRole[];
  children: React.ReactNode;
};

export function PortalShell({ userName, accessRoles, children }: PortalShellProps) {
  const pathname = usePathname();
  const roleSet = new Set(accessRoles);
  const sections = NAV_SECTIONS.filter((s) => roleSet.has(s.role));
  const section = sectionForPath(pathname);

  return (
    <div className="flex flex-1" style={{ background: "var(--bg-soft)" }}>
      {/* Sidebar */}
      <aside
        className="flex w-[250px] flex-none flex-col overflow-y-auto py-5"
        style={{
          background: "#0A0A0A",
          borderRight: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <div className="px-5 pb-4">
          <div
            className="text-[17px] font-bold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Deedar Drive
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: "rgba(241,247,242,.55)" }}>
            Distribution Portal
          </div>
        </div>

        <nav className="flex-1">
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
                    {sec.title}
                  </span>
                </div>
                {sec.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="mx-3 my-px block rounded-[12px] px-3.5 py-2 text-[14px] font-semibold transition-colors"
                      style={{
                        background: active ? theme.bg : "transparent",
                        color: active ? theme.strong : theme.muted,
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div
          className="mt-3 px-5 pt-3.5"
          style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}
        >
          <div className="mb-2 text-[12px]" style={{ color: "rgba(241,247,242,.7)" }}>
            {userName}
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-[13px] font-semibold" style={{ color: "#B9D6BC" }}>
              Log out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content — recolored per role section */}
      <main
        className="flex-1 overflow-y-auto px-8 py-7"
        style={themeVars(ROLE_THEME[section])}
      >
        {children}
      </main>
    </div>
  );
}
