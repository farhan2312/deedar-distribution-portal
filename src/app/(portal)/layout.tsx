import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { primaryRoleLabel } from "@/lib/auth/roles";
import { PortalShell } from "./_components/portal-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <PortalShell
      userName={user.name}
      phone={user.phone}
      roleLabel={primaryRoleLabel(user.accessRoles)}
      accessRoles={user.accessRoles}
    >
      {children}
    </PortalShell>
  );
}
