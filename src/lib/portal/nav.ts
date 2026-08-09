import type { AccessRole } from "@/db/schema";

export type RoleTheme = {
  /** primary accent for this role's screens + active nav text */
  strong: string;
  /** light tint used as active-nav pill background */
  bg: string;
  /** section dot + title color */
  dot: string;
  /** inactive nav item text (readable on the dark sidebar) */
  muted: string;
};

export const ROLE_THEME: Record<AccessRole, RoleTheme> = {
  field: { strong: "#7B2FA0", bg: "#F3E5FB", dot: "#B565D8", muted: "#9C6FB8" },
  supervisor: { strong: "#4C8C2B", bg: "#EAF6E1", dot: "#8FCB63", muted: "#7CA36B" },
  dealer: { strong: "#128A82", bg: "#DFF5F3", dot: "#4FC3B8", muted: "#5FA39D" },
  hq: { strong: "#B9812E", bg: "#FBEAD1", dot: "#E3A542", muted: "#CBA06B" },
  khq: { strong: "#C1442A", bg: "#FBE5E1", dot: "#E8836C", muted: "#C17A6A" },
  admin: { strong: "#6B5B3E", bg: "#EFE6D2", dot: "#A6926B", muted: "#B3A588" },
};

export type NavItem = { href: string; label: string };

export type NavSection = {
  role: AccessRole;
  title: string;
  items: NavItem[];
};

/** Sidebar sections in display order — filtered per-user by the roles they have. */
export const NAV_SECTIONS: NavSection[] = [
  {
    role: "field",
    title: "Field Salesman",
    items: [
      { href: "/field/day-log", label: "Day Log" },
      { href: "/field/beat", label: "Beat" },
      { href: "/field/new-counter", label: "New Counter" },
    ],
  },
  {
    role: "supervisor",
    title: "Supervisor",
    items: [
      { href: "/supervisor/map", label: "Live map" },
      { href: "/supervisor/analytics", label: "Analytics" },
      { href: "/supervisor/day-log", label: "Day Log" },
      { href: "/supervisor/assign-beat", label: "Assign Beat" },
    ],
  },
  {
    role: "dealer",
    title: "Dealer",
    items: [
      { href: "/dealer/counters", label: "Counters" },
      { href: "/dealer/schemes", label: "Schemes" },
    ],
  },
  {
    role: "hq",
    title: "C&F Sales",
    items: [
      { href: "/hq/dashboard", label: "Dashboard" },
      { href: "/hq/depots", label: "Depots & Areas" },
    ],
  },
  {
    role: "khq",
    title: "Kanpur HQ",
    items: [{ href: "/khq/dashboard", label: "Company Dashboard" }],
  },
  {
    role: "admin",
    title: "Central Admin",
    items: [
      { href: "/admin/hierarchy", label: "Hierarchy" },
      { href: "/admin/users", label: "Users & access" },
      { href: "/admin/schemes", label: "Scheme codes" },
    ],
  },
];

/** Which role-section a portal path belongs to (drives the main-content accent). */
export function sectionForPath(pathname: string): AccessRole {
  if (pathname.startsWith("/field")) return "field";
  if (pathname.startsWith("/supervisor")) return "supervisor";
  if (pathname.startsWith("/dealer")) return "dealer";
  if (pathname.startsWith("/hq")) return "hq";
  if (pathname.startsWith("/khq")) return "khq";
  return "admin";
}

/** CSS custom props that recolor a screen's --accent to the role's theme. */
export function themeVars(theme: RoleTheme): React.CSSProperties {
  return {
    "--accent": theme.strong,
    "--accent-hover": theme.strong,
    "--accent-tint": `${theme.bg}`,
    "--bg-soft": theme.bg,
    "--hairline-soft": theme.bg,
  } as React.CSSProperties;
}
