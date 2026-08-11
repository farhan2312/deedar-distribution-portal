import { config } from "dotenv";

config({ path: ".env.local" });

// Adds visits.duration_seconds — time the rep spent on the counter, sampled
// from the client-side timer at submit. Nullable + additive + idempotent.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE visits
        ADD COLUMN IF NOT EXISTS duration_seconds integer
    `;
    console.log("visits.duration_seconds ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
