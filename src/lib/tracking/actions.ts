"use server";

import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { istDateString } from "@/lib/date";
import {
  WS_TICKET_PURPOSE,
  WS_TICKET_TTL_SECONDS,
  type TicketClaims,
} from "./protocol";

type TicketResult =
  | { ok: true; ticket: string }
  | { ok: false; error: string; code?: "other_device" };

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

async function sign(claims: TicketClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${WS_TICKET_TTL_SECONDS}s`)
    .sign(secret());
}

/**
 * Mint a short-lived WebSocket credential for the CURRENT session. The ticket
 * carries a server-derived user id — the browser never tells the WS service
 * who it is, so it can't impersonate another rep or watch a team it doesn't own.
 *
 * Reps only get a ticket while they're actually on the clock: the day must be
 * started and not yet ended (IST day). Ending the day makes the ticket
 * unrenewable, which is what stops tracking.
 *
 * Only the device that STARTED the day may share location. `deviceId` (the
 * browser's stored id) is checked against `day_logs.tracking_device_id`: a
 * second login on the same account gets `code: "other_device"` and no ticket,
 * so the SO/C&F map only ever shows the day-starter's single, stable pin. A
 * day with no owner recorded (started before this feature) is left open.
 */
export async function issueRepTicket(deviceId?: string): Promise<TicketResult> {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) {
    return { ok: false, error: "Not authorized." };
  }

  const [log] = await db
    .select({
      startAt: dayLogs.startAt,
      endAt: dayLogs.endAt,
      trackingDeviceId: dayLogs.trackingDeviceId,
    })
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.logDate, istDateString())))
    .limit(1);

  if (!log?.startAt) return { ok: false, error: "Start your day to enable tracking." };
  if (log.endAt) return { ok: false, error: "Your day is closed — tracking is off." };

  // Ownership guard: a day bound to another device won't share from this one.
  if (log.trackingDeviceId && log.trackingDeviceId !== (deviceId?.trim() || null)) {
    return {
      ok: false,
      error: "Your day was started on another device — location is shared there.",
      code: "other_device",
    };
  }

  const ticket = await sign({ userId: user.id, role: "rep", purpose: WS_TICKET_PURPOSE });
  return { ok: true, ticket };
}

/** Mint a watcher ticket for a Sales Officer, C&F HQ, or admin. The WS service
 * resolves which reps each watcher may see from the database, not from the
 * client — an SO gets their reports-to team, HQ gets their C&F's field reps. */
export async function issueWatcherTicket(): Promise<TicketResult> {
  const user = await getCurrentUser();
  if (!user || (!canAccess(user, "supervisor") && !canAccess(user, "hq"))) {
    return { ok: false, error: "Not authorized." };
  }
  const ticket = await sign({ userId: user.id, role: "watcher", purpose: WS_TICKET_PURPOSE });
  return { ok: true, ticket };
}
