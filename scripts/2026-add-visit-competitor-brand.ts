import { config } from "dotenv";

config({ path: ".env.local" });

// Free-text competitor brand name on a visit, when competitor presence is
// "local" or "national" (e.g. "Tata Tea"). Adds visits.competitor_brand.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE visits
      ADD COLUMN IF NOT EXISTS competitor_brand varchar(80)
    `;
    console.log("visits.competitor_brand ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
