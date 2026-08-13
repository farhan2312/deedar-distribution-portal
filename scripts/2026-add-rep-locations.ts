import { config } from "dotenv";

config({ path: ".env.local" });

// Latest-known-position table for realtime field-rep tracking. One row per
// user (PK = user_id) — the WebSocket service UPSERTs it, so a rep's row is
// UPDATEd in place rather than appended. No history is retained.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS rep_locations (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        lat numeric(10, 6) NOT NULL,
        lng numeric(10, 6) NOT NULL,
        accuracy_m integer,
        recorded_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    console.log("rep_locations ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
