"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { istDateString } from "@/lib/date";

async function requireField() {
  const user = await getCurrentUser();
  if (!user?.accessRoles.includes("field")) return null;
  return user;
}

/** Stamp today's (IST) start time — once per day. */
export async function startDay() {
  const user = await requireField();
  if (!user) return { ok: false as const, error: "Not authorized." };

  const now = new Date();
  const logDate = istDateString(now);

  const [existing] = await db
    .select()
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.logDate, logDate)))
    .limit(1);

  if (existing?.startAt) return { ok: true as const }; // already started

  if (existing) {
    await db
      .update(dayLogs)
      .set({ startAt: now, updatedAt: now })
      .where(eq(dayLogs.id, existing.id));
  } else {
    await db.insert(dayLogs).values({ userId: user.id, logDate, startAt: now });
  }

  revalidatePath("/field/day-log");
  revalidatePath("/field/beat");
  return { ok: true as const };
}

/** Stamp today's (IST) end time — requires a start first, once per day. */
export async function endDay() {
  const user = await requireField();
  if (!user) return { ok: false as const, error: "Not authorized." };

  const now = new Date();
  const logDate = istDateString(now);

  const [existing] = await db
    .select()
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.logDate, logDate)))
    .limit(1);

  if (!existing?.startAt) return { ok: false as const, error: "Start your day first." };
  if (existing.endAt) return { ok: true as const }; // already ended

  await db
    .update(dayLogs)
    .set({ endAt: now, updatedAt: now })
    .where(eq(dayLogs.id, existing.id));

  revalidatePath("/field/day-log");
  return { ok: true as const };
}
