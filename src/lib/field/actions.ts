"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, stockists } from "@/db/schema";
import { recordAudit, diffFields } from "@/lib/audit/record";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { hasStartedToday, START_DAY_REQUIRED } from "@/lib/field/day-log";
import { GPS_REQUIRED, parseCoords } from "@/lib/field/gps";

export type DuplicateMatch = { name: string; type: string; area: string } | null;

/** A duplicate as seen by a field rep — includes the counter id and whether
 * it's in the rep's own depot, so the wizard can offer "add a visit instead"
 * rather than just blocking. */
export type FieldDuplicateMatch =
  | { id: string; name: string; type: string; area: string; stockistName: string; canVisit: boolean }
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
      typeOther: counters.typeOther,
      area: areas.name,
      stockistId: counters.stockistId,
      stockistName: stockists.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(eq(counters.phone, phone))
    .limit(1);
  if (!match) return null;

  const isAdmin = user.accessRoles.includes("admin");
  return {
    id: match.id,
    name: match.name,
    type: counterTypeLabel(match.type, match.typeOther),
    area: match.area,
    stockistName: match.stockistName,
    canVisit: isAdmin || match.stockistId === user.depot?.id,
  };
}

export type NewCounterInput = {
  name: string;
  phone: string;
  address: string;
  stockistId: string;
  areaId: string;
  type: "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";
  /** Free-text label, required when `type` is "Others" (e.g. "Medical Store").
   * Ignored for every other type. */
  typeOther?: string;
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
  // Admin isn't on a beat and keeps no day log, so the clock-in gate is for
  // reps only.
  if (!isAdmin && !(await hasStartedToday(user.id))) {
    return { ok: false as const, error: START_DAY_REQUIRED };
  }
  if (!isAdmin && input.stockistId !== user.depot?.id) {
    return { ok: false as const, error: "You can only add counters in your own depot." };
  }
  // Wholesale counters are Supervisor-added only — this action backs the
  // field counter form, which never offers Wholesale, for anyone (including
  // admin) — that's added via the Supervisor form/action instead.
  if (input.type === "Wholesale") {
    return { ok: false as const, error: "Wholesale counters are added by your Supervisor, not from the field." };
  }
  const typeOther = input.type === "Others" ? input.typeOther?.trim() : "";
  if (input.type === "Others" && !typeOther) {
    return { ok: false as const, error: "Enter the counter type." };
  }

  const [depot] = await db.select().from(stockists).where(eq(stockists.id, input.stockistId)).limit(1);
  if (!depot) return { ok: false as const, error: "Unknown depot." };

  const [area] = await db.select().from(areas).where(eq(areas.id, input.areaId)).limit(1);
  if (!area || area.stockistId !== depot.id) {
    return { ok: false as const, error: "Area does not belong to the selected depot." };
  }

  const [existing] = await db
    .select({ id: counters.id })
    .from(counters)
    .where(eq(counters.phone, input.phone))
    .limit(1);
  if (existing) return { ok: false as const, error: "This mobile number is already a counter." };

  const coords = parseCoords(input.gps);
  if (!coords) return { ok: false as const, error: GPS_REQUIRED };

  // The id comes back so the caller can send the rep straight into the visit
  // for the counter they are standing in front of.
  const [created] = await db
    .insert(counters)
    .values({
      name: input.name.trim(),
      phone: input.phone,
      address: input.address.trim() || null,
      stockistId: depot.id,
      areaId: area.id,
      type: input.type,
      typeOther: typeOther || null,
      lat: coords.lat,
      lng: coords.lng,
      status: "active",
      createdByUserId: user.id,
    })
    .returning({ id: counters.id });

  await recordAudit({
    action: "create",
    module: "counters",
    entityId: created.id,
    entityLabel: input.name.trim(),
    summary: `Added counter ${input.name.trim()} (${counterTypeLabel(input.type, typeOther || null)}) in ${area.name}, ${depot.name}`,
  });

  return { ok: true as const, counterId: created.id };
}

export type EditCounterInput = {
  name: string;
  address: string;
  areaId: string;
  type: NewCounterInput["type"];
  /** Free-text label, required when `type` is "Others". */
  typeOther?: string;
  gps: string;
};

/** Edit a counter's identity — allowed only for counters in the rep's own depot. */
export async function updateCounter(counterId: string, input: EditCounterInput) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user, "field")) {
    return { ok: false as const, error: "Not authorized." };
  }
  if (!input.name.trim()) return { ok: false as const, error: "Name is required." };

  // The pre-edit values come back with the permission check rather than in a
  // second query: the audit row needs them, and re-reading afterwards would
  // read what was just written.
  const [counter] = await db
    .select({
      id: counters.id,
      stockistId: counters.stockistId,
      type: counters.type,
      typeOther: counters.typeOther,
      name: counters.name,
      address: counters.address,
      areaName: areas.name,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, counterId))
    .limit(1);
  if (!counter) return { ok: false as const, error: "Counter not found." };

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && counter.stockistId !== user.depot?.id) {
    return { ok: false as const, error: "You can only edit counters in your own depot." };
  }
  // This action backs the field counter form, which never offers Wholesale,
  // for anyone. A caller may keep an existing Wholesale counter Wholesale
  // (unchanged), but can't convert another type into Wholesale from here.
  if (input.type === "Wholesale" && counter.type !== "Wholesale") {
    return { ok: false as const, error: "Wholesale counters are added by your Supervisor, not from the field." };
  }
  const typeOther = input.type === "Others" ? input.typeOther?.trim() : "";
  if (input.type === "Others" && !typeOther) {
    return { ok: false as const, error: "Enter the counter type." };
  }

  const [area] = await db.select().from(areas).where(eq(areas.id, input.areaId)).limit(1);
  if (!area || area.stockistId !== counter.stockistId) {
    return { ok: false as const, error: "Area does not belong to this counter's depot." };
  }

  // Also enforced on edit, not just create — that's what closes the gap for
  // counters added before coordinates were mandatory.
  const coords = parseCoords(input.gps);
  if (!coords) return { ok: false as const, error: GPS_REQUIRED };

  await db
    .update(counters)
    .set({
      name: input.name.trim(),
      address: input.address.trim() || null,
      areaId: area.id,
      type: input.type,
      typeOther: typeOther || null,
      lat: coords.lat,
      lng: coords.lng,
      updatedAt: new Date(),
    })
    .where(eq(counters.id, counterId));

  await recordAudit({
    action: "update",
    module: "counters",
    entityId: counterId,
    entityLabel: input.name.trim(),
    summary: `Edited counter ${input.name.trim()}`,
    changes: counterChanges(counter, { ...input, areaName: area.name, typeOther, coords }),
  });

  revalidatePath(`/field/counter/${counterId}`);
  revalidatePath("/field/beat");
  return { ok: true as const };
}

/**
 * What actually moved in a counter edit.
 *
 * Coordinates are compared at five decimals — about a metre. A rep editing a
 * counter re-sends a fresh GPS fix every time, so comparing them raw would
 * report "location changed" on every save and teach anyone reading the log to
 * ignore that line.
 */
function counterChanges(
  before: {
    name: string;
    address: string | null;
    areaName: string;
    type: string;
    typeOther: string | null;
    lat: string | null;
    lng: string | null;
  },
  after: {
    name: string;
    address: string;
    areaName: string;
    type: NewCounterInput["type"];
    typeOther?: string;
    coords: { lat: string; lng: string };
  },
) {
  // Numeric columns come back as strings, and so does a freshly parsed fix —
  // both go through Number() before rounding so the comparison is arithmetic.
  const place = (lat: string | null, lng: string | null) =>
    lat == null || lng == null ? null : `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  return diffFields(
    {
      name: before.name,
      address: before.address,
      area: before.areaName,
      type: counterTypeLabel(before.type, before.typeOther),
      gps: place(before.lat, before.lng),
    },
    {
      name: after.name.trim(),
      address: after.address.trim() || null,
      area: after.areaName,
      type: counterTypeLabel(after.type, after.typeOther || null),
      gps: place(after.coords.lat, after.coords.lng),
    },
    { name: "Name", address: "Address", area: "Area", type: "Type", gps: "Location" },
  );
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
      stockistName: string;
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
      typeOther: counters.typeOther,
      area: areas.name,
      stockistId: counters.stockistId,
      stockistName: stockists.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .where(eq(counters.phone, phone))
    .limit(1);

  if (!c) return { found: false };

  const isAdmin = user.accessRoles.includes("admin");
  const canVisit = isAdmin || c.stockistId === user.depot?.id;
  if (!canVisit) return { found: true, canVisit: false };

  return {
    found: true,
    canVisit: true,
    id: c.id,
    name: c.name,
    type: counterTypeLabel(c.type, c.typeOther),
    area: c.area,
    stockistName: c.stockistName,
  };
}

