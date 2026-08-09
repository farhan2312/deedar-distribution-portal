import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, depots, userAreas, userDepots, users } from "@/db/schema";
import { getSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      accessRoles: users.accessRoles,
      depotId: users.depotId,
      depotName: depots.name,
      cnfId: users.cnfId,
      cnfName: cnfs.name,
    })
    .from(users)
    .leftJoin(depots, eq(depots.id, users.depotId))
    .leftJoin(cnfs, eq(cnfs.id, users.cnfId))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;

  const [assignedAreas, supervisedDepots] = await Promise.all([
    db
      .select({ id: areas.id, name: areas.name })
      .from(userAreas)
      .innerJoin(areas, eq(areas.id, userAreas.areaId))
      .where(eq(userAreas.userId, user.id)),
    db
      .select({ id: depots.id, name: depots.name })
      .from(userDepots)
      .innerJoin(depots, eq(depots.id, userDepots.depotId))
      .where(eq(userDepots.userId, user.id)),
  ]);

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    accessRoles: user.accessRoles,
    depot: user.depotId ? { id: user.depotId, name: user.depotName! } : null,
    cnf: user.cnfId ? { id: user.cnfId, name: user.cnfName! } : null,
    areas: assignedAreas, // field: which areas within `depot` they cover
    supervisedDepots, // supervisor: which depots they oversee
  };
});
