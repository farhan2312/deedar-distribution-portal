import type { AccessRole } from "@/db/schema";

/**
 * The chatbot's fixed question catalog.
 *
 * Deliberately NOT `server-only` and deliberately free of any `@/db` import:
 * the client imports this to render the menu, so pulling in the postgres
 * driver here would drag `fs`/`net` into the browser bundle and fail the
 * build. All the actual querying lives in the sibling `answers.ts`, which IS
 * server-only. (Same split rationale as `_components/map-colors.ts`.)
 */

/** Menu section a question is filed under. */
export type IntentGroup = "Today" | "My team" | "Company";

/**
 * A rendered answer. Text arrives already translated — the server action runs
 * `getT()` before returning, so the client needs no interpolation machinery
 * for the numbers and names spliced into these sentences.
 */
export type IntentAnswer = {
  /** Headline sentence. */
  text: string;
  /** Optional supporting rows — rep names, counter names, per-depot counts. */
  items?: { label: string; value?: string }[];
  /** Optional deep link to the screen showing the full picture. */
  link?: { href: string; label: string };
};

/** Same discriminated shape the rest of the app's server actions return. */
export type AskResult =
  | { ok: true; answer: IntentAnswer }
  | { ok: false; error: string };

export type Intent = {
  id: string;
  /**
   * Roles that see this question. Checked again server-side in `askIntent` —
   * this list is UX (what to show), not the security boundary.
   */
  roles: AccessRole[];
  /** English text, which doubles as the i18n dictionary key. */
  label: string;
  group: IntentGroup;
};

/** Order here is the order they appear in the menu, within each group. */
export const INTENTS: Intent[] = [
  // ── Field ISR ─────────────────────────────────────────────────────────
  { id: "my_visits_today", roles: ["field"], group: "Today", label: "How many visits have I done today?" },
  { id: "my_beat_today", roles: ["field"], group: "Today", label: "What's on my beat today?" },
  { id: "am_i_clocked_in", roles: ["field"], group: "Today", label: "Am I clocked in?" },
  { id: "my_new_counters_today", roles: ["field"], group: "Today", label: "How many new counters have I added today?" },

  // ── Sales Officer ─────────────────────────────────────────────────────
  { id: "team_not_clocked_in", roles: ["supervisor"], group: "My team", label: "Who hasn't clocked in today?" },
  { id: "team_visits_today", roles: ["supervisor"], group: "My team", label: "How many visits has my team done today?" },
  { id: "team_open_days", roles: ["supervisor"], group: "My team", label: "Who has a day still open?" },
  { id: "team_top_rep", roles: ["supervisor"], group: "My team", label: "Who has done the most visits today?" },

  // ── C&F HQ / Kanpur HQ / Admin ────────────────────────────────────────
  { id: "packets_sold_today", roles: ["hq", "khq"], group: "Company", label: "How many packets were sold today?" },
  { id: "visits_company_today", roles: ["hq", "khq"], group: "Company", label: "How many visits company-wide today?" },
  { id: "declining_counters", roles: ["hq", "khq"], group: "Company", label: "How many declining counters?" },
  { id: "top_depot_today", roles: ["hq", "khq"], group: "Company", label: "Which depot did the most visits today?" },
  { id: "pending_access_requests", roles: ["admin"], group: "Company", label: "How many users are awaiting approval?" },
  { id: "open_bug_reports", roles: ["admin"], group: "Company", label: "How many bug reports are open?" },
];

/** Group headers in display order. Empty groups are skipped by the caller. */
export const INTENT_GROUPS: IntentGroup[] = ["Today", "My team", "Company"];

/**
 * Questions this user may ask. Admin sees everything — matching how the
 * sidebar shows an admin every section, and how `canAccess` lets admin
 * through every role gate.
 */
export function intentsForUser(accessRoles: readonly AccessRole[]): Intent[] {
  if (accessRoles.includes("admin")) return INTENTS;
  return INTENTS.filter((i) => i.roles.some((r) => accessRoles.includes(r)));
}

/** Look up one intent by id. `undefined` for an unknown id — the caller
 * rejects rather than guessing. */
export function findIntent(id: string): Intent | undefined {
  return INTENTS.find((i) => i.id === id);
}
