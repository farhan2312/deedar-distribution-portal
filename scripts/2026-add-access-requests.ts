import { config } from "dotenv";

config({ path: ".env.local" });

// Adds the public "Request Access" signup flow: a pending request an admin
// approves (creates the real users row) or rejects. Additive + idempotent.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      DO $$ BEGIN
        CREATE TYPE access_request_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS access_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        phone varchar(10) NOT NULL,
        password_hash text NOT NULL,
        requested_role access_role NOT NULL,
        status access_request_status NOT NULL DEFAULT 'pending',
        reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    console.log("access_requests table ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
