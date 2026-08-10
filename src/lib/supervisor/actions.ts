"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, beatAssignments, counters, dayLogs, depots, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import type { DuplicateMatch } from "@/lib/field/actions";

type Result = { ok: true } | { ok: false; error: string };

function supervisedDepotIds(user: { depot: { id: string } | null; supervisedDepots: { id: string }[] }) {
  const ids = new Set(user.supervisedDepots.map((d) => d.id));
  if (user.depot) ids.add(user.depot.id);
  return ids;
}

/**
 * A field rep's Beat is exactly: counters they created themselves, UNION
 * counters a Supervisor assigns here for a given IST day. This is the only
 * way to hand a rep counters they didn't add — there's no "assign an area"
 * fallback.
 */
export async function assignBeat(
  repUserId: string,
  counterIds: string[],
  beatDate: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.accessRoles.includes("supervisor")) {
    return { ok: false, error: "Not authorized." };
  }
  if (counterIds.length === 0) return { ok: false, error: "Select at least one counter." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beatDate)) return { ok: false, error: "Invalid date." };

  const [rep] = await db
    .select({ id: users.id, depotId: users.depotId })
    .from(users)
    .where(eq(users.id, repUserId))
    .limit(1);
  if (!rep?.depotId) return { ok: false, error: "Rep not found or has no depot." };

  if (!isAdmin) {
    const supervised = supervisedDepotIds(user);
    if (!supervised.has(rep.depotId)) {
      return { ok: false, error: "You don't supervise this rep's depot." };
    }
  }

  const counterRows = await db
    .select({ id: counters.id, depotId: counters.depotId })
    .from(counters)
    .where(inArray(counters.id, counterIds));
  if (counterRows.length !== counterIds.length) {
    return { ok: false, error: "Some counters were not found." };
  }
  if (counterRows.some((c) => c.depotId !== rep.depotId)) {
    return { ok: false, error: "All counters must be in the rep's own depot." };
  }

  await db
    .insert(beatAssignments)
    .values(counterIds.map((counterId) => ({ repUserId, counterId, assignedByUserId: user.id, beatDate })))
    .onConflictDoNothing();

  revalidatePath("/supervisor/assign-beat");
  revalidatePath("/field/beat");
  return { ok: true };
}

/**
 * Force-close a day a rep forgot to end. The Supervisor picks the end time;
 * we stamp `endAt` and mark it as SO-forced (audit: `endForced` + who).
 * Only works on a day that was started but never ended, for a rep who reports
 * to this Supervisor (admin bypasses the reports-to check).
 */
export async function forceEndDay(
  repUserId: string,
  logDate: string,
  endAtISO: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.accessRoles.includes("supervisor")) {
    return { ok: false, error: "Not authorized." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return { ok: false, error: "Invalid date." };
  const endAt = new Date(endAtISO);
  if (Number.isNaN(endAt.getTime())) return { ok: false, error: "Invalid end time." };

  const [rep] = await db
    .select({ id: users.id, reportsToUserId: users.reportsToUserId })
    .from(users)
    .where(eq(users.id, repUserId))
    .limit(1);
  if (!rep) return { ok: false, error: "Rep not found." };
  if (!isAdmin && rep.reportsToUserId !== user.id) {
    return { ok: false, error: "This rep doesn't report to you." };
  }

  const [log] = await db
    .select()
    .from(dayLogs)
    .where(and(eq(dayLogs.userId, repUserId), eq(dayLogs.logDate, logDate)))
    .limit(1);
  if (!log) return { ok: false, error: "No day log for that date." };
  if (!log.startAt) return { ok: false, error: "Rep never started that day." };
  if (log.endAt) return { ok: false, error: "That day is already closed." };
  if (endAt.getTime() < log.startAt.getTime()) {
    return { ok: false, error: "End time can't be before the start time." };
  }
  if (endAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "End time can't be in the future." };
  }

  await db
    .update(dayLogs)
    .set({ endAt, endForced: true, endedByUserId: user.id, updatedAt: new Date() })
    .where(eq(dayLogs.id, log.id));

  revalidatePath("/supervisor/exceptions");
  revalidatePath("/supervisor/day-log");
  return { ok: true };
}

// ── Counters (SO can add counters, but never record visits) ─────────────

export type SupervisorCounterInput = {
  name: string;
  phone: string;
  address: string;
  depotId: string;
  areaId: string;
  type: "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";
  gps: string;
};

/** Look up a counter by mobile — the SO's duplicate check before adding one. */
export async function checkDuplicateForSupervisor(phone: string): Promise<DuplicateMatch> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.accessRoles.includes("supervisor") && !user.accessRoles.includes("admin")) return null;
  if (!/^\d{10}$/.test(phone)) return null;

  const [match] = await db
    .select({ name: counters.name, type: counters.type, area: areas.name })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.phone, phone))
    .limit(1);

  return match ?? null;
}

/** Create a counter in a depot the SO supervises (admin: any depot). */
export async function createCounterBySupervisor(input: SupervisorCounterInput): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.accessRoles.includes("supervisor")) {
    return { ok: false, error: "Not authorized." };
  }
  if (!input.name.trim() || !/^\d{10}$/.test(input.phone)) {
    return { ok: false, error: "Name and a valid 10-digit mobile are required." };
  }

  if (!isAdmin) {
    const supervised = supervisedDepotIds(user);
    if (!supervised.has(input.depotId)) {
      return { ok: false, error: "You can only add counters in a depot you supervise." };
    }
  }

  const [depot] = await db.select().from(depots).where(eq(depots.id, input.depotId)).limit(1);
  if (!depot) return { ok: false, error: "Unknown depot." };

  const [area] = await db.select().from(areas).where(eq(areas.id, input.areaId)).limit(1);
  if (!area || area.depotId !== depot.id) {
    return { ok: false, error: "Area does not belong to the selected depot." };
  }

  const [existing] = await db
    .select({ id: counters.id })
    .from(counters)
    .where(eq(counters.phone, input.phone))
    .limit(1);
  if (existing) return { ok: false, error: "This mobile number is already a counter." };

  const [lat, lng] = input.gps.split(",").map((s) => s.trim());

  await db.insert(counters).values({
    name: input.name.trim(),
    phone: input.phone,
    address: input.address.trim() || null,
    depotId: depot.id,
    areaId: area.id,
    type: input.type,
    lat: lat || null,
    lng: lng || null,
    status: "active",
    createdByUserId: user.id,
  });

  revalidatePath("/supervisor/assign-beat");
  return { ok: true };
}
