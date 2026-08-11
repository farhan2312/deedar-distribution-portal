"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "./dal";
import { hashPassword, verifyPassword } from "./password";

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
  if (input.newPassword.length < 6) {
    return { ok: false, error: "New password must be at least 6 characters." };
  }
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
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  return { ok: true };
}
