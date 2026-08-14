import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window rate limiting for the two publicly reachable entry points.
 *
 * Backed by Postgres, not an in-memory Map: Next.js runs across instances, and
 * a per-process counter would let an attacker spread attempts around to defeat
 * it. The window start is part of the primary key, so a new window is simply a
 * new row — no background expiry job needed.
 *
 * These helpers FAIL CLOSED (a DB error denies the request). That's safe for
 * login and signup because both need the database anyway, so a limiter outage
 * means the endpoint couldn't have worked regardless.
 */

export type RateLimitOptions = {
  /** Max hits allowed inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function windowFor(windowMs: number) {
  const now = Date.now();
  const startMs = Math.floor(now / windowMs) * windowMs;
  return {
    windowStart: new Date(startMs),
    retryAfterSeconds: Math.max(1, Math.ceil((startMs + windowMs - now) / 1000)),
  };
}

/** Drop windows that closed over a day ago, so the table can't grow forever. */
async function pruneOccasionally() {
  if (Math.random() > 0.01) return;
  try {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  } catch {
    // Housekeeping only — never fail a request because pruning failed.
  }
}

/**
 * Count this hit against `key` and report whether it's still allowed.
 * The increment and read are one atomic statement, so concurrent requests
 * can't slip past the limit.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const { windowStart, retryAfterSeconds } = windowFor(windowMs);
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    void pruneOccasionally();
    if ((row?.count ?? 0) > limit) return { ok: false, retryAfterSeconds };
    return { ok: true };
  } catch {
    return { ok: false, retryAfterSeconds };
  }
}

/**
 * Read a counter WITHOUT incrementing it — used to gate on past failures so a
 * successful login is never penalised by the same bucket it's checked against.
 */
export async function peekRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const { windowStart, retryAfterSeconds } = windowFor(windowMs);
  try {
    const [row] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
      .limit(1);
    if ((row?.count ?? 0) >= limit) return { ok: false, retryAfterSeconds };
    return { ok: true };
  } catch {
    return { ok: false, retryAfterSeconds };
  }
}

/** Increment a counter without gating on it — records a failed attempt. */
export async function bumpRateLimit(key: string, { windowMs }: RateLimitOptions): Promise<void> {
  const { windowStart } = windowFor(windowMs);
  try {
    await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      });
  } catch {
    // Best effort — a lost failure count must not break the login flow.
  }
}

/**
 * Best-effort client IP. Behind Azure the real address is the FIRST entry of
 * `x-forwarded-for`; later entries are proxies. A client can forge this header,
 * so treat IP buckets as friction against casual abuse, not a hard identity —
 * the per-account buckets are the ones that actually protect a credential.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}
