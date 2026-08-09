import type { AccessRole } from "@/db/schema";

/** Landing route after login — picks the first role the user has, in priority order. */
export function defaultPathForRoles(roles: readonly AccessRole[]): string {
  if (roles.includes("field")) return "/field/beat";
  if (roles.includes("supervisor")) return "/supervisor/map";
  if (roles.includes("dealer")) return "/dealer/counters";
  if (roles.includes("hq")) return "/hq/dashboard";
  if (roles.includes("khq")) return "/khq/dashboard";
  if (roles.includes("admin")) return "/admin/hierarchy";
  return "/dashboard";
}
