import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs, type AuditAction, type AuditChange, type AuditModule } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Write one line to the audit log.
 *
 * Three rules shape this:
 *
 * 1. **It never throws.** An audit write failing must not fail the action it
 *    was describing — an admin should not be unable to add a user because the
 *    log is unhappy. Failures are swallowed and reported to the server console.
 * 2. **The actor is resolved here, not passed in.** Every caller already ran
 *    its own guard, so re-reading the session is a cache hit, and it means no
 *    caller can log the wrong person by mistake.
 * 3. **Actor name and phone are copied in.** The row has to still read
 *    correctly after that account is deleted — which is the event you most
 *    want to look back at.
 */
export async function recordAudit(entry: {
  action: AuditAction;
  module: AuditModule;
  entityId?: string | null;
  entityLabel?: string | null;
  summary?: string | null;
  changes?: AuditChange[] | null;
  /** For the events that happen before a session exists: a failed login knows
   * the phone that was tried and nothing else. */
  actor?: { id?: string | null; name?: string | null; phone?: string | null };
}): Promise<void> {
  try {
    const actor = entry.actor ?? (await actorFromSession());
    const { ip, userAgent } = await requestMeta();

    await db.insert(auditLogs).values({
      actorUserId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorPhone: actor?.phone ?? null,
      action: entry.action,
      module: entry.module,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel?.slice(0, 200) ?? null,
      summary: entry.summary?.slice(0, 300) ?? null,
      // An empty array is noise in the "changes" column; store nothing.
      changes: entry.changes && entry.changes.length > 0 ? entry.changes : null,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error("[audit] failed to record", entry.action, entry.module, err);
  }
}

async function actorFromSession() {
  const user = await getCurrentUser();
  return user ? { id: user.id, name: user.name, phone: user.phone } : null;
}

/**
 * One hop, in the form an admin reads.
 *
 * `::ffff:103.163.105.139` is an IPv4 address wearing an IPv6 coat, and `::1`
 * is the IPv6 spelling of `127.0.0.1` — both are printed as the dotted quad,
 * which is the same address said the way everyone writes it.
 */
function normaliseIp(ip: string): string {
  if (ip === "::1") return "127.0.0.1";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}

/**
 * Caller IP and user agent.
 *
 * The address is stored WHOLE: `x-forwarded-for` is a chain — client first,
 * then each proxy that forwarded it — and keeping only the first hop threw
 * away the part that says which route the request actually took. What is
 * recorded is what was claimed, not proof of origin: any of these hops is
 * forgeable if the app is ever exposed without a proxy in front, and the audit
 * log is the wrong place to pretend otherwise.
 *
 * `x-real-ip` is appended only when it names an address the chain does not
 * already contain, so the common case (both headers agreeing) stays one entry.
 *
 * Only what the request carried is recorded — no address is resolved or
 * inferred. A request made on the server itself has no internet-facing
 * address to log, and `127.0.0.1` is the true and complete answer for it;
 * real client addresses arrive once the app runs behind a proxy that sets
 * `x-forwarded-for`.
 */
async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const hops = (h.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normaliseIp);
    const real = h.get("x-real-ip")?.trim();
    if (real && !hops.includes(normaliseIp(real))) hops.push(normaliseIp(real));

    const ip = hops.join(", ") || null;
    return { ip: ip ? ip.slice(0, 200) : null, userAgent: h.get("user-agent") };
  } catch {
    // Outside a request (a script, a background job) there are no headers.
    return { ip: null, userAgent: null };
  }
}

/**
 * Build a `changes` array by diffing two flat objects.
 *
 * Only keys whose value actually moved are kept, so a form resubmitted
 * untouched logs an update with no field list rather than every field claiming
 * to have changed from itself.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const key of Object.keys(after)) {
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (from === to) continue;
    out.push({ field: labels[key] ?? key, from, to });
  }
  return out;
}

function normalise(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.join(", ");
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
