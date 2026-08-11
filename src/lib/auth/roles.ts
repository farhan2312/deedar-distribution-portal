import type { AccessRole } from "@/db/schema";

/** Landing route after login — picks the first role the user has, in priority order. */
export function defaultPathForRoles(roles: readonly AccessRole[]): string {
  if (roles.includes("field")) return "/field/beat";
  if (roles.includes("supervisor")) return "/supervisor/map";
  if (roles.includes("dealer")) return "/depot/counters";
  if (roles.includes("hq")) return "/hq/dashboard";
  if (roles.includes("khq")) return "/khq/dashboard";
  if (roles.includes("admin")) return "/admin/hierarchy";
  return "/dashboard";
}

export const ROLE_LABEL: Record<AccessRole, string> = {
  field: "Field Salesman",
  supervisor: "Supervisor (SO)",
  dealer: "Depot",
  hq: "C&F HQ",
  khq: "Kanpur HQ",
  admin: "Central Admin",
};

/** Roles a self-service "Request Access" signup may request — admin is
 * granted by an existing admin only, never self-requested. */
export const SIGNUP_ROLES: AccessRole[] = ["field", "supervisor", "dealer", "hq", "khq"];

/** The most senior role to show as a single label (profile menu, etc.) when a
 * user holds several — admin outranks everything else. */
export function primaryRoleLabel(roles: readonly AccessRole[]): string {
  const seniority: AccessRole[] = ["admin", "khq", "hq", "supervisor", "dealer", "field"];
  const top = seniority.find((r) => roles.includes(r));
  return top ? ROLE_LABEL[top] : "No access assigned";
}
