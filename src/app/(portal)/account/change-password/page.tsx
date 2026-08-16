import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  const forced = user.mustChangePassword;

  return (
    <div className="mx-auto max-w-md">
      <h4 className="page-title">{forced ? t("Set your password") : t("Change password")}</h4>
      <p className="page-subtitle mb-6">
        {t("Signed in as")} {user.name} · {user.phone}
      </p>
      {forced && (
        <div
          className="mb-4 rounded-xl border p-4 text-[13px]"
          style={{ borderColor: "var(--hairline)", background: "var(--accent-tint)", color: "var(--ink-1)" }}
        >
          {t("Your account was set up with your mobile number as a temporary password. Choose a new one to continue — your current password is your mobile number.")}
        </div>
      )}
      <ChangePasswordForm forced={forced} />
    </div>
  );
}
