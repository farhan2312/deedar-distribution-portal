import { config } from "dotenv";

config({ path: ".env.local" });

// Soft-disable for users: `is_active` (default true). A deactivated user can't
// log in and is treated as logged-out, but their visits/counters are kept —
// the reversible alternative to deleting the account.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `;
    console.log("users.is_active ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
