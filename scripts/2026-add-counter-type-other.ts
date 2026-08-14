import { config } from "dotenv";

config({ path: ".env.local" });

// Free-text label for counters typed "Others" (e.g. "Medical Store") instead
// of the generic enum value. Adds `type_other` to counters — null for every
// type except "Others". Existing "Others" rows stay null (no label to
// backfill from) and just display as "Others" until edited.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE counters
      ADD COLUMN IF NOT EXISTS type_other varchar(60)
    `;
    console.log("counters.type_other ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
