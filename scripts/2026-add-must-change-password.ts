import { config } from "dotenv";

config({ path: ".env.local" });

// Force a password reset at first login for admin-created accounts (whose
// password is their phone number). Adds `must_change_password` to users.
// Existing rows default false — we can't tell retroactively who still has a
// phone-as-password, so the flag is forward-looking (every NEW addUser sets it).
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false
    `;
    console.log("users.must_change_password ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
