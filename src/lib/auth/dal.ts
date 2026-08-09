import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
});
