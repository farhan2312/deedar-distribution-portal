import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AccessRole, User } from "@/db/schema";

const COOKIE_NAME = "session";
const REMEMBERED_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days — "Remember me" checked
const UNREMEMBERED_DURATION_SECONDS = 24 * 60 * 60; // 1 day — "Remember me" unchecked

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is not set");
}
const encodedSecret = new TextEncoder().encode(secret);

export type SessionPayload = {
  userId: string;
  roles: AccessRole[];
};

async function encrypt(payload: SessionPayload, durationSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${durationSeconds}s`)
    .sign(encodedSecret);
}

async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * `rememberMe` controls both the JWT's own expiry and whether the cookie
 * persists across browser restarts. Checked: 7-day token + a persistent
 * cookie (`maxAge` set). Unchecked: 1-day token + a browser-session cookie
 * (no `maxAge`) — relying on the shorter token expiry too, since not every
 * browser reliably drops session cookies on close (mobile especially).
 */
export async function createSession(user: Pick<User, "id" | "accessRoles">, rememberMe = true) {
  const duration = rememberMe ? REMEMBERED_DURATION_SECONDS : UNREMEMBERED_DURATION_SECONDS;
  const token = await encrypt({ userId: user.id, roles: user.accessRoles }, duration);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: duration } : {}),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decrypt(token);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
