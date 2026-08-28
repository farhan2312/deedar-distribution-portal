import "server-only";
import { cache } from "react";
import { alias } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, stockists, userAreas, userStockists, users } from "@/db/schema";
import { getSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const so = alias(users, "so");
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      accessRoles: users.accessRoles,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
      stockistId: users.stockistId,
      stockistName: stockists.name,
      cnfId: users.cnfId,
      cnfName: cnfs.name,
      reportsToId: users.reportsToUserId,
      reportsToName: so.name,
    })
    .from(users)
    .leftJoin(stockists, eq(stockists.id, users.stockistId))
    .leftJoin(cnfs, eq(cnfs.id, users.cnfId))
    .leftJoin(so, eq(so.id, users.reportsToUserId))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;
  // Deactivated mid-session → treat as logged out on the very next request, so
  // a disabled account loses access immediately rather than at token expiry.
  if (!user.isActive) return null;

  const [assignedAreas, supervisedStockists] = await Promise.all([
    db
      .select({ id: areas.id, name: areas.name })
      .from(userAreas)
      .innerJoin(areas, eq(areas.id, userAreas.areaId))
      .where(eq(userAreas.userId, user.id)),
    db
      .select({ id: stockists.id, name: stockists.name })
      .from(userStockists)
      .innerJoin(stockists, eq(stockists.id, userStockists.stockistId))
      .where(eq(userStockists.userId, user.id)),
  ]);

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    accessRoles: user.accessRoles,
    mustChangePassword: user.mustChangePassword,
    depot: user.stockistId ? { id: user.stockistId, name: user.stockistName! } : null,
    cnf: user.cnfId ? { id: user.cnfId, name: user.cnfName! } : null,
    reportsTo: user.reportsToId ? { id: user.reportsToId, name: user.reportsToName! } : null,
    areas: assignedAreas, // field: which areas within `depot` they cover
    supervisedStockists, // supervisor: which stockists they oversee
  };
});
