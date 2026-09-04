"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

/**
 * Public: "I've forgotten my password."
 *
 * Unauthenticated by necessity — the whole point is that the caller can't log
 * in. Two consequences shape it:
 *
 * 1. The reply is identical whether or not the number is registered. Otherwise
 *    this becomes an oracle for testing which mobile numbers have accounts.
 *    A number with no account is accepted and then dropped: the caller cannot
 *    tell the difference, and no row reaches the admin's queue.
 * 2. It writes a request for an admin to action; it never changes a password.
 *    There is no email or SMS channel in this app, so there is nothing to send
 *    a reset link over — the admin recognising the person IS the verification
 *    step, and a self-service reset here would let anyone reset any account.
 */
export async function requestPasswordReset(phone: string): Promise<ResetRequestResult> {
  const digits = phone.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return { ok: false, error: "Enter a valid 10-digit mobile number." };
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, digits))
    .limit(1);

  // Only a real account gets a row. An unknown number used to be queued too,
  // on the reasoning that it was worth an admin's eye — in practice it just
  // filled the queue with typos, and there is nothing an admin can do about a
  // request that names no account.
  if (user) {
    // Already asked and not yet actioned: silently succeed rather than queueing
    // a second identical row for the admin. A partial unique index enforces the
    // same thing if two submits race.
    const [pending] = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(eq(passwordResetRequests.phone, digits), eq(passwordResetRequests.status, "pending")),
      )
      .limit(1);

    if (!pending) {
      await db
        .insert(passwordResetRequests)
        .values({ phone: digits, userId: user.id })
        // Covers the race the check above can lose.
        .onConflictDoNothing();
    }
  }

  // Same answer either way — see the note above.
  return { ok: true };
}
