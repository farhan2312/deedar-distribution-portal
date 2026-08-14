import { config } from "dotenv";

config({ path: ".env.local" });

// Fixed-window rate-limit counters for the two publicly reachable entry points
// (login, "Request Access"). Composite PK on (key, window_start): a new window
// is a new row, so counters expire by being ignored rather than needing a job.
// The index supports the opportunistic prune of long-closed windows.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key text NOT NULL,
        window_start timestamptz NOT NULL,
        count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (key, window_start)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON rate_limits (window_start)
    `;
    console.log("rate_limits ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
