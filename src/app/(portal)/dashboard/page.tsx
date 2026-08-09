import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { defaultPathForRoles } from "@/lib/auth/roles";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const target = defaultPathForRoles(user.accessRoles);
  if (target !== "/dashboard") redirect(target);

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
        Signed in
      </p>
      <h1 className="mt-2 text-2xl font-bold text-[#0d3b2e]">{user.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {user.phone}
        {user.accessRoles.length > 0 && ` · ${user.accessRoles.join(", ")}`}
      </p>
      <p className="mt-6 text-sm text-zinc-600">
        No access roles assigned yet. Ask your admin to grant access from Users
        &amp; access.
      </p>
    </div>
  );
}
