import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { userStockists, users, type AccessRole } from "@/db/schema";
import { istDateString } from "@/lib/date";

/**
 * Central Admin entering a counter or a visit for someone else.
 *
 * Reps work in villages where the signal comes and goes, so a counter or a
 * visit sometimes reaches HQ by phone instead of through the app. Entered as
 * admin, it used to be credited to Central Admin and stamped with the moment
 * it was typed — so the rep lost it from their counts, and an evening's
 * catch-up landed every visit on the wrong time, or the wrong day.
 *
 * These are the shared rules for crediting the right person on the right day.
 * The audit row still records that admin did the typing; this only fixes whose
 * work it is and when it happened.
 */

/** Someone an entry can be credited to. The pickers show only the people of
 * the entry's own stockist — a rep logs counters and visits in their own depot
 * and nowhere else, so anyone outside it is a name that could only be wrong. */
export type ProxyPerson = {
  id: string;
  name: string;
  /** Every stockist this person works in: an ISR's own, plus each stockist a
   * Sales Officer supervises. */
  stockistIds: string[];
  /** Marked in the picker, so an SO isn't mistaken for one of the reps. */
  isSupervisor: boolean;
};

/** Active people holding any of `roles`, for a picker. The users table is a
 * few dozen rows, so it is read whole and filtered here rather than in SQL. */
export async function listProxyPeople(roles: AccessRole[]): Promise<ProxyPerson[]> {
  const [rows, supervised] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        stockistId: users.stockistId,
        accessRoles: users.accessRoles,
        isActive: users.isActive,
      })
      .from(users)
      .orderBy(asc(users.name)),
    // A Sales Officer has no single stockist; their stockists live here.
    db
      .select({ userId: userStockists.userId, stockistId: userStockists.stockistId })
      .from(userStockists),
  ]);
  const supervisedBy = new Map<string, string[]>();
  for (const s of supervised) {
    supervisedBy.set(s.userId, [...(supervisedBy.get(s.userId) ?? []), s.stockistId]);
  }
  return rows
    .filter((u) => u.isActive && u.accessRoles.some((r) => roles.includes(r)))
    .map((u) => {
      const isSupervisor = u.accessRoles.includes("supervisor") && roles.includes("supervisor");
      const own = u.stockistId ? [u.stockistId] : [];
      return {
        id: u.id,
        name: u.name,
        stockistIds: isSupervisor ? [...new Set([...own, ...(supervisedBy.get(u.id) ?? [])])] : own,
        isSupervisor,
      };
    });
}

/**
 * The person an entry is credited to, if they may be: active, and holding one
 * of `roles` — or the admin themself, who can still enter their own work.
 */
export async function loadProxyPerson(
  userId: string,
  roles: AccessRole[],
  self: { id: string; name: string },
): Promise<{ id: string; name: string } | null> {
  if (userId === self.id) return self;
  const people = await listProxyPeople(roles);
  const match = people.find((p) => p.id === userId);
  return match ? { id: match.id, name: match.name } : null;
}

/** Nothing in this system predates it; an earlier year is a typo. */
const EARLIEST = "2020-01-01";

/** A `YYYY-MM-DD` the admin may credit an entry to — a real calendar date, not
 * in the future, not absurdly old. */
export function isProxyDate(date: string, today: string = istDateString()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // Round-trips only if the day exists: "2026-02-30" comes back as March.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  return date >= EARLIEST && date <= today;
}

/**
 * The instant an entry dated `date` is stored at.
 *
 * Only the day is asked for — a rep phoning in yesterday's visits doesn't know
 * the minute of each. Today keeps the real time of entry. An earlier day gets
 * midday IST: every report buckets visits by IST date, and noon is the one
 * time no timezone arithmetic can push onto the neighbouring day.
 */
export function proxyInstant(date: string, now: Date = new Date()): Date {
  return date === istDateString(now) ? now : new Date(`${date}T12:00:00+05:30`);
}
