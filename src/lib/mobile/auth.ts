import "server-only";
import { canAccess } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Shared pieces for the `/api/mobile/*` routes used by the ISR Android app.
 *
 * The app authenticates with the SAME session token the web portal keeps in its
 * `session` cookie: it stores the token on the phone and sends it back as a
 * `Cookie: session=…` header. So `getSession()` / `getCurrentUser()` work here
 * unchanged, and every rule they enforce (expiry, deactivated accounts) applies
 * to the app exactly as it does to the website.
 */

/** Mirrors `COOKIE_NAME` in `@/lib/auth/session` (not exported there). */
export const SESSION_COOKIE = "session";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The profile the app needs — never the whole user record. */
export function toMobileUser(user: CurrentUser) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    mustChangePassword: user.mustChangePassword,
    depot: user.depot,
    areas: user.areas,
    reportsTo: user.reportsTo,
  };
}

export type MobileUser = ReturnType<typeof toMobileUser>;

/**
 * Resolves the signed-in ISR, or the error response to send instead. A
 * missing/expired token or a deactivated account is 401 (the app signs out);
 * a valid account without the field role is 403 — the app is ISR-only.
 */
export async function requireIsr(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Your session has ended. Sign in again." }, { status: 401 }),
    };
  }
  if (!canAccess(user, "field")) {
    return { ok: false, response: notIsrResponse() };
  }
  return { ok: true, user };
}

export function notIsrResponse(): Response {
  return Response.json(
    { error: "This app is for field salesmen (ISR) only. Use the website instead." },
    { status: 403 },
  );
}
