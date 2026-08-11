import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md">
      <h4 className="page-title">Change password</h4>
      <p className="page-subtitle mb-6">
        Signed in as {user.name} · {user.phone}
      </p>
      <ChangePasswordForm />
    </div>
  );
}
