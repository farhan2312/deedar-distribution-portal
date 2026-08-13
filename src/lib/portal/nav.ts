import type { AccessRole } from "@/db/schema";

export type RoleTheme = {
  /** primary accent for this role's screens + active nav text */
  strong: string;
  /** deeper end of the accent — gradients (primary buttons, active nav pill) */
  deep: string;
  /** light tint used behind accented elements */
  bg: string;
  /** section dot + title color */
  dot: string;
  /** inactive nav item text (readable on the dark sidebar) */
  muted: string;
  /** `strong` as "r, g, b" so CSS can build rgba() glows from it */
  rgb: string;
};

export const ROLE_THEME: Record<AccessRole, RoleTheme> = {
  field: { strong: "#7B2FA0", deep: "#5B1C7A", bg: "#F3E5FB", dot: "#B565D8", muted: "#9C6FB8", rgb: "123, 47, 160" },
  supervisor: { strong: "#4C8C2B", deep: "#356B1B", bg: "#EAF6E1", dot: "#8FCB63", muted: "#7CA36B", rgb: "76, 140, 43" },
  dealer: { strong: "#128A82", deep: "#0A6660", bg: "#DFF5F3", dot: "#4FC3B8", muted: "#5FA39D", rgb: "18, 138, 130" },
  hq: { strong: "#B9812E", deep: "#8F611D", bg: "#FBEAD1", dot: "#E3A542", muted: "#CBA06B", rgb: "185, 129, 46" },
  khq: { strong: "#C1442A", deep: "#93301C", bg: "#FBE5E1", dot: "#E8836C", muted: "#C17A6A", rgb: "193, 68, 42" },
  admin: { strong: "#6B5B3E", deep: "#4C3F28", bg: "#EFE6D2", dot: "#A6926B", muted: "#B3A588", rgb: "107, 91, 62" },
};

export type NavIcon =
  | "calendar"
  | "target"
  | "plusCircle"
  | "mapPin"
  | "barChart"
  | "users"
  | "grid"
  | "tag"
  | "dashboard"
  | "building"
  | "globe"
  | "sitemap"
  | "userCog"
  | "alert"
  | "box"
  | "bug"
  | "clipboard";

export type NavItem = { href: string; label: string; icon: NavIcon };

export type NavSection = {
  role: AccessRole;
  title: string;
  items: NavItem[];
};

/** Sidebar sections in display order — filtered per-user by the roles they have. */
export const NAV_SECTIONS: NavSection[] = [
  {
    role: "field",
    title: "Field Salesman ISR",
    items: [
      { href: "/field/day-log", label: "Day Log", icon: "calendar" },
      { href: "/field/beat", label: "Beat", icon: "target" },
      { href: "/field/new-counter", label: "New Counter", icon: "plusCircle" },
    ],
  },
  {
    role: "supervisor",
    title: "Sales Officer",
    items: [
      { href: "/supervisor/map", label: "Live map", icon: "mapPin" },
      { href: "/supervisor/analytics", label: "Analytics", icon: "barChart" },
      { href: "/supervisor/day-log", label: "Day Log", icon: "calendar" },
      { href: "/supervisor/exceptions", label: "Exceptions", icon: "alert" },
      { href: "/supervisor/assign-beat", label: "Assign Beat", icon: "users" },
      { href: "/supervisor/assignments", label: "Assignment Summary", icon: "clipboard" },
      { href: "/supervisor/new-counter", label: "New Counter", icon: "plusCircle" },
    ],
  },
  {
    role: "dealer",
    title: "Depot",
    items: [
      { href: "/depot/counters", label: "Counters", icon: "grid" },
      { href: "/depot/schemes", label: "Schemes", icon: "tag" },
      { href: "/depot/stock", label: "Stock", icon: "box" },
    ],
  },
  {
    role: "hq",
    title: "C&F Sales",
    items: [
      { href: "/hq/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/hq/map", label: "Live map", icon: "mapPin" },
      { href: "/hq/depots", label: "Depots & Areas", icon: "building" },
    ],
  },
  {
    role: "khq",
    title: "Kanpur HQ",
    items: [{ href: "/khq/dashboard", label: "Company Dashboard", icon: "globe" }],
  },
  {
    role: "admin",
    title: "Central Admin",
    items: [
      { href: "/admin/hierarchy", label: "Hierarchy", icon: "sitemap" },
      { href: "/admin/users", label: "Users & access", icon: "userCog" },
      { href: "/admin/schemes", label: "Scheme codes", icon: "tag" },
      { href: "/admin/bugs", label: "Bug Tracker", icon: "bug" },
    ],
  },
];

/** Which role-section a portal path belongs to (drives the main-content accent). */
export function sectionForPath(pathname: string): AccessRole {
  if (pathname.startsWith("/field")) return "field";
  if (pathname.startsWith("/supervisor")) return "supervisor";
  if (pathname.startsWith("/depot")) return "dealer";
  if (pathname.startsWith("/hq")) return "hq";
  if (pathname.startsWith("/khq")) return "khq";
  return "admin";
}

/**
 * Breadcrumb for the top bar: the role section, then the page. Falls back to
 * a title-cased last path segment for routes with no nav entry (detail pages
 * like /field/counter/[id]).
 */
export function breadcrumbForPath(pathname: string): { section: string; page: string } {
  const role = sectionForPath(pathname);
  const section = NAV_SECTIONS.find((s) => s.role === role);

  // Longest matching nav href wins, so /field/counter/x maps to its parent.
  let best: NavItem | null = null;
  for (const s of NAV_SECTIONS) {
    for (const item of s.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
  }
  if (best) return { section: section?.title ?? "Deedar Drive", page: best.label };

  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const page = last
    ? last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Dashboard";
  return { section: section?.title ?? "Deedar Drive", page };
}

/** CSS custom props that recolor a screen's --accent to the role's theme. */
export function themeVars(theme: RoleTheme): React.CSSProperties {
  return {
    "--accent": theme.strong,
    "--accent-hover": theme.strong,
    "--accent-rgb": theme.rgb,
    "--accent-tint": `${theme.bg}`,
    "--bg-soft": theme.bg,
    "--hairline-soft": theme.bg,
  } as React.CSSProperties;
}
