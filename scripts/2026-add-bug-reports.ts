import { config } from "dotenv";

config({ path: ".env.local" });

// Bug / feature reports filed from the top-bar "Report a Bug" button and
// triaged by admin in the Bug Tracker. Additive + idempotent.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      DO $$ BEGIN CREATE TYPE bug_type AS ENUM ('bug', 'feature');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    await sql`
      DO $$ BEGIN CREATE TYPE bug_severity AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    await sql`
      DO $$ BEGIN CREATE TYPE bug_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type bug_type NOT NULL DEFAULT 'bug',
        title varchar(200) NOT NULL,
        description text,
        severity bug_severity NOT NULL DEFAULT 'medium',
        page varchar(300),
        screenshot text,
        reported_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        status bug_status NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
        ON bug_reports (status, created_at DESC)
    `;
    console.log("bug_reports ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
