import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { defaultPathForRoles } from "@/lib/auth/roles";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const { phone, password } = await request.json();

  if (typeof phone !== "string" || typeof password !== "string") {
    return Response.json({ error: "Phone and password are required." }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone.trim()))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid phone number or password." }, { status: 401 });
  }

  await createSession(user);

  return Response.json({ ok: true, redirectTo: defaultPathForRoles(user.accessRoles) });
}
