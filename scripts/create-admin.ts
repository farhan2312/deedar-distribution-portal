import { config } from "dotenv";
import type { AccessRole } from "../src/db/schema";

config({ path: ".env.local" });

const ADMIN_DEPOT_NAME = "Indergarh Depot";
const ADMIN_AREA_NAME = "Karvar";

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { users, depots, areas, userAreas, userDepots } = await import(
    "../src/db/schema"
  );
  const { hashPassword } = await import("../src/lib/auth/password");

  const name = process.env.ADMIN_NAME;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !phone || !password) {
    throw new Error("ADMIN_NAME, ADMIN_PHONE, and ADMIN_PASSWORD must be set in .env.local");
  }

  const passwordHash = await hashPassword(password);

  // Central admin gets every access role so they can view the platform as any role.
  const allRoles: AccessRole[] = ["field", "supervisor", "dealer", "hq", "khq", "admin"];

  const [homeDepot] = await db
    .select()
    .from(depots)
    .where(eq(depots.name, ADMIN_DEPOT_NAME))
    .limit(1);
  const [homeArea] = homeDepot
    ? await db
        .select()
        .from(areas)
        .where(eq(areas.name, ADMIN_AREA_NAME))
        .limit(1)
    : [];
  const allDepots = await db.select().from(depots);

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

  let userId: string;
  if (existing) {
    await db
      .update(users)
      .set({
        name,
        passwordHash,
        accessRoles: allRoles,
        depotId: homeDepot?.id ?? null,
        cnfId: homeDepot?.cnfId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.phone, phone));
    userId = existing.id;
    console.log(`Updated existing admin "${name}" (${phone}) with all access roles.`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        name,
        phone,
        passwordHash,
        accessRoles: allRoles,
        depotId: homeDepot?.id ?? null,
        cnfId: homeDepot?.cnfId ?? null,
      })
      .returning({ id: users.id });
    userId = created.id;
    console.log(`Created admin "${name}" (${phone}) with all access roles.`);
  }

  // Field preview needs an assigned area; supervisor preview needs assigned depots.
  await db.delete(userAreas).where(eq(userAreas.userId, userId));
  if (homeArea) {
    await db.insert(userAreas).values({ userId, areaId: homeArea.id });
  }
  await db.delete(userDepots).where(eq(userDepots.userId, userId));
  if (allDepots.length > 0) {
    await db.insert(userDepots).values(allDepots.map((d) => ({ userId, depotId: d.id })));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
