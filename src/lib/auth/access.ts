import type { AccessRole } from "@/db/schema";

/**
 * Whether a user may open a role's section. Admins are unrestricted — they see
 * every sidebar section and bypass all depot/C&F/area scoping — so any explicit
 * role check also passes for an admin.
 */
export function canAccess(user: { accessRoles: AccessRole[] }, role: AccessRole): boolean {
  return user.accessRoles.includes(role) || user.accessRoles.includes("admin");
}
