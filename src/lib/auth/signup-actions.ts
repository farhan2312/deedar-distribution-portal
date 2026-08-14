"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, users, type AccessRole } from "@/db/schema";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { hashPassword } from "./password";
import { validatePasswordLength } from "./password-policy";
import { SIGNUP_ROLES } from "./roles";

/** Anyone can reach this without an account, and every accepted call writes a
 * row an admin has to review — so cap it, or the pending-approvals queue can be
 * flooded. Server actions are POST endpoints reachable without our UI, so the
 * limit has to live here rather than in the form. */
const SIGNUP_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

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
  const ip = await clientIp();
  const limited = await checkRateLimit(`signup:ip:${ip}`, SIGNUP_LIMIT);
  if (!limited.ok) {
    return { ok: false, error: "Too many requests. Try again later." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter your full name." };
  // Unbounded until now: this is a public endpoint writing straight to a `text`
  // column, so cap it rather than accept a megabyte "name".
  if (name.length > 80) return { ok: false, error: "Name is too long." };
  if (!/^\d{10}$/.test(input.phone)) {
    return { ok: false, error: "Enter a valid 10-digit mobile number." };
  }
  const pwError = validatePasswordLength(input.password);
  if (pwError) return { ok: false, error: pwError };
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
