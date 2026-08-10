import { config } from "dotenv";

config({ path: ".env.local" });

// Adds the Supervisor force-end audit columns to day_logs:
//   end_forced      — true when a Supervisor closed a day the rep forgot to end
//   ended_by_user_id — which Supervisor stamped the end time
// Additive + idempotent (IF NOT EXISTS), so it's safe to re-run.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE day_logs
        ADD COLUMN IF NOT EXISTS end_forced boolean NOT NULL DEFAULT false
    `;
    await sql`
      ALTER TABLE day_logs
        ADD COLUMN IF NOT EXISTS ended_by_user_id uuid
        REFERENCES users(id) ON DELETE SET NULL
    `;
    console.log("day_logs: end_forced + ended_by_user_id ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
