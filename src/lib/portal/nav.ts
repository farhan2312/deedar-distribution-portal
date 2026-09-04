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
  depot: { strong: "#128A82", deep: "#0A6660", bg: "#DFF5F3", dot: "#4FC3B8", muted: "#5FA39D", rgb: "18, 138, 130" },
  // Dealers use the same portal as depots, so they read as the same section.
  dealer: { strong: "#128A82", deep: "#0A6660", bg: "#DFF5F3", dot: "#4FC3B8", muted: "#5FA39D", rgb: "18, 138, 130" },
  hq: { strong: "#B9812E", deep: "#8F611D", bg: "#FBEAD1", dot: "#E3A542", muted: "#CBA06B", rgb: "185, 129, 46" },
  khq: { strong: "#C1442A", deep: "#93301C", bg: "#FBE5E1", dot: "#E8836C", muted: "#C17A6A", rgb: "193, 68, 42" },
  admin: { strong: "#6B5B3E", deep: "#4C3F28", bg: "#EFE6D2", dot: "#A6926B", muted: "#B3A588", rgb: "107, 91, 62" }
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
  | "shield"
  | "clipboard";

export type NavItem = {
  href: string;
  /** Sidebar text — kept short so the rail stays scannable. */
  label: string;
  /** Top-bar title, when the page deserves a fuller name than the sidebar
   * can carry ("Beat" in the rail, "Today's Beat" as the heading). Defaults
   * to `label`. */
  heading?: string;
  icon: NavIcon;
  /** One-line description shown under the title in the portal shell's top
   * bar. Kept with the title so a page body never renders an orphaned
   * subtitle. */
  blurb?: string;
};

export type NavSection = {
  /** Extra roles that also reach this section, beyond `role`. */
  alsoRoles?: AccessRole[];
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
      {
        href: "/field/day-log",
        label: "Day Log",
        icon: "calendar",
        blurb: "Clock in, log the stock you picked up, and close out the day.",
      },
      {
        href: "/field/beat",
        label: "Beat",
        heading: "Today's Beat",
        icon: "target",
        blurb: "The counters assigned to you for today — check in as you go.",
      },
      // Browsable list of every counter in the rep's depot — a way to check
      // into a counter that isn't on today's beat without hunting by mobile.
      {
        href: "/field/counters",
        label: "All Counters",
        icon: "grid",
        blurb: "Every counter at your stockist — tap Check in to open its page.",
      },
      {
        href: "/field/map",
        label: "Live map",
        icon: "mapPin",
        blurb: "You and your counters, plotted live.",
      },
      {
        href: "/field/new-counter",
        label: "New Counter",
        icon: "plusCircle",
        blurb: "Add a retail outlet to your stockist's list.",
      },
    ],
  },
  {
    role: "supervisor",
    title: "Sales Officer",
    items: [
      {
        href: "/supervisor/map",
        label: "Live map",
        icon: "mapPin",
        blurb: "Your field salesmen and their counters, plotted live.",
      },
      {
        href: "/supervisor/analytics",
        label: "Analytics",
        heading: "Analytics Overview",
        icon: "barChart",
        blurb: "Track your team's performance and visits across your stockists.",
      },
      {
        href: "/supervisor/day-log",
        label: "Day Log",
        icon: "calendar",
        blurb: "Clock-in and clock-out times for every field salesman in view.",
      },
      {
        href: "/supervisor/exceptions",
        label: "Exceptions",
        icon: "alert",
        blurb:
          "Reps who clocked in but never clocked out. Force-close the day with the correct end time on their behalf.",
      },
      {
        href: "/supervisor/assign-beat",
        label: "Assign Beat",
        heading: "Assign Daily Beat",
        icon: "users",
        blurb:
          "Build a set of counters and hand them to a sales rep — schedule 1 day ahead or up to a week out.",
      },
      // Read-only browseable list of every counter in the SO's supervised
      // stockists — for scoping beats and answering "does depot X have this
      // outlet?" without needing to check-in.
      {
        href: "/supervisor/counters",
        label: "All Counters",
        heading: "All Counters — your stockists",
        icon: "grid",
        blurb: "Every counter in the stockists you supervise — view only.",
      },
      {
        href: "/supervisor/assignments",
        label: "Assignment Summary",
        icon: "clipboard",
        blurb: "Every daily beat assignment scheduled across the week.",
      },
      {
        href: "/supervisor/new-counter",
        label: "New Counter",
        icon: "plusCircle",
        blurb: "Add a retail outlet to one of the stockists you supervise.",
      },
    ],
  },
  {
    role: "depot",
    // Depots and dealers (including sub-dealers, whose managers hold the
    // dealer role) share one portal — the screens are identical, only the
    // stockist behind them differs.
    alsoRoles: ["dealer"],
    title: "Stockist",
    items: [
      {
        href: "/depot/counters",
        label: "Counters",
        heading: "Wholesale counters",
        icon: "grid",
        blurb: "Wholesale outlets served by this stockist.",
      },
      {
        href: "/depot/schemes",
        label: "Schemes",
        icon: "tag",
        blurb: "Retailer scheme payouts, settled via UPI.",
      },
      {
        href: "/depot/stock",
        label: "Stock",
        icon: "box",
        blurb: "Daily inward / outward movement, tracked per SKU.",
      },
    ],
  },
  {
    role: "hq",
    title: "C&F Sales",
    items: [
      {
        href: "/hq/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        blurb: "Performance across every stockist, area and rep in this C&F.",
      },
      {
        href: "/hq/map",
        label: "Live map",
        icon: "mapPin",
        blurb: "Every field salesman and counter across this C&F, live.",
      },
      {
        href: "/hq/depots",
        label: "Stockists & Areas",
        icon: "building",
        blurb: "The depots, dealers and areas that make up this C&F.",
      },
    ],
  },
  {
    role: "khq",
    title: "Kanpur HQ",
    items: [
      {
        href: "/khq/dashboard",
        label: "Company Dashboard",
        icon: "globe",
        blurb: "Company-wide view across every state, C&F HQ, depot and area.",
      },
      {
        href: "/khq/reports",
        label: "Reports",
        icon: "clipboard",
        blurb: "All counters and visits company-wide, exportable to CSV.",
      },
    ],
  },
  {
    role: "admin",
    title: "Central Admin",
    items: [
      {
        href: "/admin/hierarchy",
        label: "Hierarchy",
        heading: "Territory Management",
        icon: "sitemap",
        blurb:
          "Central Admin sets up down to C&F HQ; each C&F Manager then adds their own depots and areas.",
      },
      {
        href: "/admin/users",
        label: "Users & access",
        icon: "userCog",
        blurb:
          "Central Admin adds every user and controls which sections they see in their sidebar.",
      },
      {
        href: "/admin/schemes",
        label: "Scheme codes",
        icon: "tag",
        blurb: "Unique, one-time-redeemable codes printed on packs/cartons.",
      },
      {
        href: "/admin/audit",
        label: "Audit Log",
        icon: "shield",
        blurb: "Who changed what, and when — every sign-in and every admin change.",
      },
      {
        href: "/admin/bugs",
        label: "Bug Tracker",
        icon: "bug",
        blurb: "Reports filed from the “Report a Bug” button across the portal.",
      },
    ],
  },
];

/** Which role-section a portal path belongs to (drives the main-content accent). */
/** Every role that opens a section — its own, plus any `alsoRoles`. */
export function sectionRoles(section: NavSection): AccessRole[] {
  return [section.role, ...(section.alsoRoles ?? [])];
}

export function sectionForPath(pathname: string): AccessRole {
  if (pathname.startsWith("/field")) return "field";
  if (pathname.startsWith("/supervisor")) return "supervisor";
  if (pathname.startsWith("/depot")) return "depot";
  if (pathname.startsWith("/hq")) return "hq";
  if (pathname.startsWith("/khq")) return "khq";
  return "admin";
}

/**
 * The sidebar entry a route belongs to (longest matching href wins), or null
 * for routes with no nav entry — detail pages like /field/counter/[id], plus
 * /dashboard and /account/*, which render their own bespoke headers. Drives
 * the automatic page header (icon + title) in the portal shell.
 */
export function navItemForPath(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const s of NAV_SECTIONS) {
    for (const item of s.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
  }
  return best;
}

/** Segments whose title-cased form reads wrong. Title-casing turns "rep" into
 * "Rep" and "isr" into "Isr"; both should read "ISR", the name used for the
 * role everywhere else in the UI. */
const SEGMENT_LABEL: Record<string, string> = {
  rep: "ISR",
  isr: "ISR",
  cnf: "C&F"
};

/** A path segment that identifies a record rather than naming a page — a UUID
 * or a bare number. Never shown to a user: the breadcrumb walks past these to
 * the last segment that actually reads as a page name. */
function isIdSegment(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9]+$/.test(segment)
  );
}

/**
 * Breadcrumb for the top bar: the role section, then the page. Falls back to
 * a title-cased path segment for routes with no nav entry (detail pages like
 * /field/counter/[id]). Id segments are skipped rather than title-cased —
 * /supervisor/rep/<uuid> was rendering the raw uuid in the top bar, and every
 * other detail route had the same problem waiting.
 */
export function breadcrumbForPath(pathname: string): { section: string; page: string } {
  const role = sectionForPath(pathname);
  const section = NAV_SECTIONS.find((s) => s.role === role);

  const best = navItemForPath(pathname);
  if (best) return { section: section?.title ?? "Deedar Drive", page: best.label };

  const last = pathname.split("/").filter(Boolean).filter((seg) => !isIdSegment(seg)).pop() ?? "";
  const page = last
    ? (SEGMENT_LABEL[last] ?? last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    : "Dashboard";
  return { section: section?.title ?? "Deedar Drive", page };
}

/** CSS custom props that recolor a screen's --accent to the role's theme. */
export function themeVars(theme: RoleTheme): React.CSSProperties {
  // Emits only RAW role values; `.role-scope` in globals.css derives the actual
  // --accent/--bg-soft/--hairline-soft from these, differently per theme. That
  // split matters twice over: inline styles beat any stylesheet, so a light
  // tint set here would stay bright in dark mode; and keeping these values
  // theme-independent means server and client render identically (no hydration
  // mismatch from a theme the server can't know).
  return {
    "--role-accent": theme.strong,
    // Lighter variant used as the accent in dark mode — the `strong` colours are
    // tuned for white and are too dim to read on #121212.
    "--role-accent-lift": theme.dot,
    "--role-tint": theme.bg,
    "--accent-rgb": theme.rgb
  } as React.CSSProperties;
}
