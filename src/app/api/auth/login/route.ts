import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { defaultPathForRoles } from "@/lib/auth/roles";
import { createSession } from "@/lib/auth/session";
import { bumpRateLimit, checkRateLimit, clientIp, peekRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit/record";

/** Per-source ceiling on login traffic. Deliberately roomy: field reps sit
 * behind carrier-grade NAT, so many legitimate users can share one IP. This
 * stops rapid credential spraying, not a targeted guess. */
const IP_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

/** The real brute-force guard: consecutive FAILED attempts against one phone
 * number. Matters here because a new user's password is their own phone number
 * until first login, so a single lucky guess would be a working credential. */
const PHONE_FAILURE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

const TOO_MANY = "Too many attempts. Try again in a few minutes.";

export async function POST(request: Request) {
  const ip = await clientIp();
  const ipCheck = await checkRateLimit(`login:ip:${ip}`, IP_LIMIT);
  if (!ipCheck.ok) {
    return Response.json(
      { error: TOO_MANY },
      { status: 429, headers: { "retry-after": String(ipCheck.retryAfterSeconds) } },
    );
  }

  const { phone, password, rememberMe } = await request.json();

  if (typeof phone !== "string" || typeof password !== "string") {
    return Response.json({ error: "Phone and password are required." }, { status: 400 });
  }

  // Gate on past failures WITHOUT counting this attempt, so a user who finally
  // types the right password is never locked out by their own successful try.
  const phoneKey = `login:phone:${phone.trim()}`;
  const phoneCheck = await peekRateLimit(phoneKey, PHONE_FAILURE_LIMIT);
  if (!phoneCheck.ok) {
    return Response.json(
      { error: TOO_MANY },
      { status: 429, headers: { "retry-after": String(phoneCheck.retryAfterSeconds) } },
    );
  }

  // Select only what login needs — never pull the whole row (defence in depth
  // so the password hash can't be accidentally echoed in a future refactor).
  // `name` is the one addition: the audit row copies it in so the log still
  // reads correctly after the account is gone.
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      passwordHash: users.passwordHash,
      accessRoles: users.accessRoles,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.phone, phone.trim()))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Only failures count toward the per-phone bucket.
    await bumpRateLimit(phoneKey, PHONE_FAILURE_LIMIT);
    // Logged with whatever is known: there is no session, and an unknown phone
    // has no user to attach to — but the attempt is the thing worth recording.
    await recordAudit({
      action: "login_failed",
      module: "auth",
      entityId: user?.id ?? null,
      entityLabel: user?.name ?? phone.trim(),
      summary: user ? "Wrong password" : "No account for this number",
      actor: { id: user?.id ?? null, name: user?.name ?? null, phone: phone.trim().slice(0, 10) },
    });
    return Response.json({ error: "Invalid phone number or password." }, { status: 401 });
  }

  // Checked AFTER the password so we don't reveal which accounts exist/are
  // disabled to someone guessing. A deactivated account can't sign in.
  if (!user.isActive) {
    await recordAudit({
      action: "login_failed",
      module: "auth",
      entityId: user.id,
      entityLabel: user.name,
      summary: "Account deactivated",
      actor: { id: user.id, name: user.name, phone: phone.trim().slice(0, 10) },
    });
    return Response.json(
      { error: "This account has been deactivated. Contact your administrator." },
      { status: 403 },
    );
  }

  await createSession(user, rememberMe !== false);
  await recordAudit({
    action: "login",
    module: "auth",
    entityId: user.id,
    entityLabel: user.name,
    summary: `Signed in as ${user.accessRoles.join(", ") || "no role"}`,
    actor: { id: user.id, name: user.name, phone: phone.trim().slice(0, 10) },
  });

  return Response.json({ ok: true, redirectTo: defaultPathForRoles(user.accessRoles) });
}
