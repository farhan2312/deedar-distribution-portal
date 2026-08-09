import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/lib/auth/password");

  const name = process.env.ADMIN_NAME;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !phone || !password) {
    throw new Error("ADMIN_NAME, ADMIN_PHONE, and ADMIN_PASSWORD must be set in .env.local");
  }

  const passwordHash = await hashPassword(password);

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ name, passwordHash, role: "admin", updatedAt: new Date() })
      .where(eq(users.phone, phone));
    console.log(`Updated existing admin "${name}" (${phone}).`);
  } else {
    await db.insert(users).values({ name, phone, passwordHash, role: "admin" });
    console.log(`Created admin "${name}" (${phone}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
