"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentUser } from "./dal";
import { hashPassword, verifyPassword } from "./password";
import { validatePasswordLength } from "./password-policy";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type Result = { ok: true } | { ok: false; error: string };

/** Any logged-in user changes their own password from the profile menu. */
export async function changeOwnPassword(input: ChangePasswordInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const pwError = validatePasswordLength(input.newPassword);
  if (pwError) return { ok: false, error: pwError };
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "New passwords don't match." };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) return { ok: false, error: "Account not found." };

  const valid = await verifyPassword(input.currentPassword, row.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };
  if (input.currentPassword === input.newPassword) {
    return { ok: false, error: "New password must be different from the current one." };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db
    .update(users)
    // Editor is the user themselves — the one edit on an account that its
    // owner makes, and recording it keeps "who touched this last" honest
    // rather than leaving an admin's name on a change they did not make.
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
      updatedByUserId: user.id,
    })
    .where(eq(users.id, user.id));

  // A password change is the one account event nobody else sees happen, which
  // is precisely why it belongs in the log.
  await recordAudit({
    action: "password_reset",
    module: "auth",
    entityId: user.id,
    entityLabel: user.name,
    summary: "Changed their own password",
  });

  return { ok: true };
}
