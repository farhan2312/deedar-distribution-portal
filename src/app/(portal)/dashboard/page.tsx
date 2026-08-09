import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { defaultPathForRoles } from "@/lib/auth/roles";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const target = defaultPathForRoles(user.accessRoles);
  if (target !== "/dashboard") redirect(target);

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8 text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
        <p className="eyebrow mt-4">Signed in</p>
        <h1 className="page-title mt-1">{user.name}</h1>
        <p className="page-subtitle">
          {user.phone}
          {user.accessRoles.length > 0 && ` · ${user.accessRoles.join(", ")}`}
        </p>
        <p className="mt-6 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          No access roles assigned yet. Ask your admin to grant access from
          Users &amp; access.
        </p>
      </div>
    </div>
  );
}
