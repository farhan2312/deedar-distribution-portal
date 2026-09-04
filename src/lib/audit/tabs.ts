import type { AuditAction, AuditModule } from "@/db/schema";

/**
 * The audit log's tabs, and what each one contains.
 *
 * Client-safe on purpose: the tab strip renders in the browser and the SQL
 * filter is built on the server, and both must agree on what "Ownership
 * Changes" means. Defining it in `lib/audit/data.ts` would have been the
 * natural place and the wrong one — that module is `server-only`, so the
 * import would drag the Postgres driver into the client bundle.
 */

export type AuditTab = "overall" | "usage" | "logins" | "activity" | "ownership";

export const AUDIT_TABS: readonly { key: AuditTab; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "usage", label: "Usage & Time" },
  { key: "logins", label: "Logins & Sessions" },
  { key: "activity", label: "Activity" },
  { key: "ownership", label: "Ownership Changes" },
];

export function isTab(v: string | undefined): v is AuditTab {
  return !!v && AUDIT_TABS.some((t) => t.key === v);
}

/**
 * The actions each tab's table is about. `null` means "no restriction".
 *
 * "Ownership Changes" is this project's version of the idea: who a person or a
 * place now belongs to. That is role grants, stockist and area mapping and
 * reporting lines — plus deletions in the org tree, since removing a stockist
 * re-homes everything under it.
 */
export const TAB_ACTIONS: Record<AuditTab, AuditAction[] | null> = {
  overall: null,
  usage: null,
  logins: ["login", "login_failed", "logout"],
  activity: ["create", "update", "delete"],
  ownership: ["update", "delete", "approve", "reject", "password_reset"],
};

/** Modules a tab restricts to, beyond its actions. */
export const TAB_MODULES: Record<AuditTab, AuditModule[] | null> = {
  overall: null,
  usage: null,
  logins: ["auth"],
  activity: null,
  ownership: ["access", "users", "stockists", "areas", "hierarchy"],
};
