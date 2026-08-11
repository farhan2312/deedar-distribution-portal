"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, users, type AccessRole } from "@/db/schema";
import { hashPassword } from "./password";
import { SIGNUP_ROLES } from "./roles";

export type RequestAccessInput = {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: AccessRole;
};

type Result = { ok: true } | { ok: false; error: string };

/** Public "Request Access" — anyone can submit; an admin approves/rejects. */
export async function requestAccess(input: RequestAccessInput): Promise<Result> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter your full name." };
  if (!/^\d{10}$/.test(input.phone)) {
    return { ok: false, error: "Enter a valid 10-digit mobile number." };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "Passwords don't match." };
  }
  if (!SIGNUP_ROLES.includes(input.role)) {
    return { ok: false, error: "Select a valid role." };
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, input.phone))
    .limit(1);
  if (existingUser) {
    return { ok: false, error: "An account with this mobile number already exists — log in instead." };
  }

  const [existingPending] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.phone, input.phone), eq(accessRequests.status, "pending")))
    .limit(1);
  if (existingPending) {
    return { ok: false, error: "A request for this mobile number is already awaiting approval." };
  }

  const passwordHash = await hashPassword(input.password);
  await db.insert(accessRequests).values({
    name,
    phone: input.phone,
    passwordHash,
    requestedRole: input.role,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
