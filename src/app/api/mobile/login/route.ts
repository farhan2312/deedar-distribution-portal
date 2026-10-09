import { cookies } from "next/headers";
import { POST as webLogin } from "@/app/api/auth/login/route";
import { canAccess } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { notIsrResponse, SESSION_COOKIE, toMobileUser } from "@/lib/mobile/auth";

/**
 * Sign-in for the ISR Android app.
 *
 * Runs the website's own login handler, so rate limiting, lockout after failed
 * attempts, deactivated-account checks and audit logging are the exact same
 * code — then hands the resulting session token back in the response body for
 * the app to keep in its secure store.
 *
 * Body: { phone, password } → 200 { token, user } | the web login's own error.
 */
export async function POST(request: Request) {
  const res = await webLogin(request);
  // Wrong password, rate limited, deactivated… — pass the website's answer
  // (status, message and retry-after) straight through.
  if (!res.ok) return res;

  const cookieStore = await cookies();
  // In a route handler `cookies()` reads back what the login just set.
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = token ? await getCurrentUser() : null;

  // Don't let the session ride back as a cookie: React Native on Android keeps
  // its own cookie jar and would replay it on every request — even after the
  // ISR signs out of the app. The token travels in the body instead.
  cookieStore.delete(SESSION_COOKIE);

  if (!token || !user) {
    return Response.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
  if (!canAccess(user, "field")) return notIsrResponse();

  return Response.json({ token, user: toMobileUser(user) });
}
