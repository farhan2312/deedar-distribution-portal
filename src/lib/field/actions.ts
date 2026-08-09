"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

export type DuplicateMatch = { name: string; type: string; area: string } | null;

export async function checkDuplicate(phone: string): Promise<DuplicateMatch> {
  const user = await getCurrentUser();
  if (!user?.accessRoles.includes("field")) return null;
  if (!/^\d{10}$/.test(phone)) return null;

  const [match] = await db
    .select({ name: counters.name, type: counters.type, area: areas.name })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.phone, phone))
    .limit(1);

  return match ?? null;
}

export type NewCounterInput = {
  name: string;
  phone: string;
  address: string;
  depotName: string;
  areaName: string;
  type: "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";
  gps: string;
};

export async function createCounter(input: NewCounterInput) {
  const user = await getCurrentUser();
  if (!user?.accessRoles.includes("field")) {
    return { ok: false as const, error: "Not authorized." };
  }
  if (!input.name.trim() || !/^\d{10}$/.test(input.phone)) {
    return { ok: false as const, error: "Name and a valid 10-digit mobile are required." };
  }

  const [depot] = await db
    .select()
    .from(depots)
    .where(eq(depots.name, input.depotName))
    .limit(1);
  if (!depot) return { ok: false as const, error: "Unknown depot." };

  const [area] = await db
    .select()
    .from(areas)
    .where(eq(areas.name, input.areaName))
    .limit(1);
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
  });

  return { ok: true as const };
}
