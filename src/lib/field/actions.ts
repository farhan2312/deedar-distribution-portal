"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";

export type DuplicateMatch = { name: string; type: string; area: string } | null;

/** A duplicate as seen by a field rep — includes the counter id and whether
 * it's in the rep's own depot, so the wizard can offer "add a visit instead"
 * rather than just blocking. */
export type FieldDuplicateMatch =
  | { id: string; name: string; type: string; area: string; depotName: string; canVisit: boolean }
  | null;

export async function checkDuplicate(phone: string): Promise<FieldDuplicateMatch> {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return null;
  if (!/^\d{10}$/.test(phone)) return null;

  const [match] = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      area: areas.name,
      depotId: counters.depotId,
      depotName: depots.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(depots, eq(depots.id, counters.depotId))
    .where(eq(counters.phone, phone))
    .limit(1);
  if (!match) return null;

  const isAdmin = user.accessRoles.includes("admin");
  return {
    id: match.id,
    name: match.name,
    type: match.type,
    area: match.area,
    depotName: match.depotName,
    canVisit: isAdmin || match.depotId === user.depot?.id,
  };
}

export type NewCounterInput = {
  name: string;
  phone: string;
  address: string;
  depotId: string;
  areaId: string;
  type: "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";
  gps: string;
};

export async function createCounter(input: NewCounterInput) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) {
    return { ok: false as const, error: "Not authorized." };
  }
  if (!input.name.trim() || !/^\d{10}$/.test(input.phone)) {
    return { ok: false as const, error: "Name and a valid 10-digit mobile are required." };
  }

  // A field rep belongs to exactly one depot and can only add counters there.
  // Admin has full visibility and may pick any depot.
  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && input.depotId !== user.depot?.id) {
    return { ok: false as const, error: "You can only add counters in your own depot." };
  }
  // Wholesale counters are Supervisor-added only — this action backs the
  // field counter form, which never offers Wholesale, for anyone (including
  // admin) — that's added via the Supervisor form/action instead.
  if (input.type === "Wholesale") {
    return { ok: false as const, error: "Wholesale counters are added by your Supervisor, not from the field." };
  }

  const [depot] = await db.select().from(depots).where(eq(depots.id, input.depotId)).limit(1);
  if (!depot) return { ok: false as const, error: "Unknown depot." };

  const [area] = await db.select().from(areas).where(eq(areas.id, input.areaId)).limit(1);
  if (!area || area.depotId !== depot.id) {
    return { ok: false as const, error: "Area does not belong to the selected depot." };
  }

  const [existing] = await db
    .select({ id: counters.id })
    .from(counters)
    .where(eq(counters.phone, input.phone))
    .limit(1);
  if (existing) return { ok: false as const, error: "This mobile number is already a counter." };

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

  return { ok: true as const };
}

export type EditCounterInput = {
  name: string;
  address: string;
  areaId: string;
  type: NewCounterInput["type"];
  gps: string;
};

/** Edit a counter's identity — allowed only for counters in the rep's own depot. */
export async function updateCounter(counterId: string, input: EditCounterInput) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) {
    return { ok: false as const, error: "Not authorized." };
  }
  if (!input.name.trim()) return { ok: false as const, error: "Name is required." };

  const [counter] = await db
    .select({ id: counters.id, depotId: counters.depotId, type: counters.type })
    .from(counters)
    .where(eq(counters.id, counterId))
    .limit(1);
  if (!counter) return { ok: false as const, error: "Counter not found." };

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && counter.depotId !== user.depot?.id) {
    return { ok: false as const, error: "You can only edit counters in your own depot." };
  }
  // This action backs the field counter form, which never offers Wholesale,
  // for anyone. A caller may keep an existing Wholesale counter Wholesale
  // (unchanged), but can't convert another type into Wholesale from here.
  if (input.type === "Wholesale" && counter.type !== "Wholesale") {
    return { ok: false as const, error: "Wholesale counters are added by your Supervisor, not from the field." };
  }

  const [area] = await db.select().from(areas).where(eq(areas.id, input.areaId)).limit(1);
  if (!area || area.depotId !== counter.depotId) {
    return { ok: false as const, error: "Area does not belong to this counter's depot." };
  }

  const [lat, lng] = input.gps.split(",").map((s) => s.trim());

  await db
    .update(counters)
    .set({
      name: input.name.trim(),
      address: input.address.trim() || null,
      areaId: area.id,
      type: input.type,
      lat: lat || null,
      lng: lng || null,
      updatedAt: new Date(),
    })
    .where(eq(counters.id, counterId));

  revalidatePath(`/field/counter/${counterId}`);
  revalidatePath("/field/beat");
  return { ok: true as const };
}

// ── Visits ────────────────────────────────────────────────────────────

export type CounterSearchResult =
  | { found: false }
  | {
      found: true;
      canVisit: true;
      id: string;
      name: string;
      type: string;
      area: string;
      depotName: string;
    }
  | {
      // Match exists but it belongs to a different depot — we intentionally
      // don't leak the counter's identity to a rep who can't act on it. Just
      // confirms "this number is taken elsewhere" so they don't try to add it
      // as new. No id/name/depot returned.
      found: true;
      canVisit: false;
    };

/** A rep can look up any counter by mobile, but out-of-depot matches only
 * confirm existence — no identifying details are returned. Admin sees everything. */
export async function searchCounterByPhone(phone: string): Promise<CounterSearchResult> {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) return { found: false };
  if (!/^\d{10}$/.test(phone)) return { found: false };

  const [c] = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      area: areas.name,
      depotId: counters.depotId,
      depotName: depots.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(depots, eq(depots.id, counters.depotId))
    .where(eq(counters.phone, phone))
    .limit(1);

  if (!c) return { found: false };

  const isAdmin = user.accessRoles.includes("admin");
  const canVisit = isAdmin || c.depotId === user.depot?.id;
  if (!canVisit) return { found: true, canVisit: false };

  return {
    found: true,
    canVisit: true,
    id: c.id,
    name: c.name,
    type: c.type,
    area: c.area,
    depotName: c.depotName,
  };
}

