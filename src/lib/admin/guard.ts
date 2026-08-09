import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";

/** Central admin has full visibility/control — every other role is scoped. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.accessRoles.includes("admin")) redirect("/dashboard");
  return user;
}
