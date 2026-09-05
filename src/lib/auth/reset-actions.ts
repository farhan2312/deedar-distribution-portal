"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";
import { istDateString } from "@/lib/date";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

/**
 * One request per number per day — counted whatever becomes of it.
 *
 * The pending-row dedup already stops a second row while one is waiting; this
 * covers the case it cannot see. Once an admin has reset the password, that
 * request is closed and the number would otherwise be free to queue another
 * one an hour later. But the admin who just reset it is already talking to the
 * person: if the password did not reach them, saying so again costs nothing,
 * whereas a fresh row costs the admin another trip through the queue.
 *
 * The IST date is part of the key, so the day turns over at midnight India
 * time rather than at a UTC boundary in the middle of the working morning.
 */
const PER_NUMBER_DAILY = { limit: 1, windowMs: 24 * 60 * 60 * 1000 };

/**
 * The enumeration guard — now the ONLY one.
 *
 * Since an unrecognised number is told it is unrecognised, this cap is all
 * that limits how fast a range of numbers can be walked: 20 answers an hour
 * from one address. A per-number cap does nothing against that attack, where
 * every number is its first attempt.
 *
 * Deliberately not tighter: a whole depot can sit behind one connection, and
 * locking a real office out of password recovery is a worse outcome than the
 * handful of probes this lets through.
 */
const PER_IP_HOURLY = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * Public: "I've forgotten my password."
 *
 * Unauthenticated by necessity — the whole point is that the caller can't log
 * in. Two things shape it:
 *
 * 1. **An unrecognised number is told so.** This is a deliberate trade, made
 *    with eyes open: it means the page can be used to test which mobile
 *    numbers have accounts. It was chosen because the silent version was worse
 *    in practice — a rep who mistyped one digit of their own number saw
 *    "Request sent", waited for an admin who had no request, and lost a day.
 *    With no email or SMS channel there is no second path to fall back on. The
 *    per-IP cap below is what is left standing between that answer and someone
 *    walking a range of numbers.
 * 2. It writes a request for an admin to action; it never changes a password.
 *    There is no reset link to send — the admin recognising the person IS the
 *    verification step, and a self-service reset here would let anyone reset
 *    any account.
 */
export async function requestPasswordReset(phone: string): Promise<ResetRequestResult> {
  const digits = phone.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return { ok: false, error: "Enter a valid 10-digit mobile number." };
  }

  const ip = await clientIp();
  const ipCheck = await checkRateLimit(`reset:ip:${ip}`, PER_IP_HOURLY);
  if (!ipCheck.ok) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  // Counted before the lookup, so probing one number repeatedly costs the
  // prober their daily slot for it whether or not it turns out to exist.
  const dayCheck = await checkRateLimit(
    `reset:phone:${digits}:${istDateString()}`,
    PER_NUMBER_DAILY,
  );
  if (!dayCheck.ok) {
    return {
      ok: false,
      error: "A reset was already requested for this number today. Please contact your admin.",
    };
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, digits))
    .limit(1);

  // Say so, rather than accepting it and dropping it. Nothing an admin can do
  // with a request that names no account, and the person needs to know now —
  // while they still have the keypad in front of them — that the number they
  // typed is not the one on their account.
  if (!user) {
    return {
      ok: false,
      error: "No user with this mobile number. Check the number, or use Request Access if you're new.",
    };
  }

  // Already asked and not yet actioned: silently succeed rather than queueing a
  // second identical row for the admin. A partial unique index enforces the
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

  return { ok: true };
}
