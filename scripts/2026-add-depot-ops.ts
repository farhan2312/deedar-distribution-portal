import { config } from "dotenv";

config({ path: ".env.local" });

// Depot portal schema: per-SKU depot stock, inward/outward movement log, and
// retailer scheme claims. Additive + idempotent.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      DO $$ BEGIN
        CREATE TYPE stock_movement_direction AS ENUM ('inward', 'outward');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE scheme_claim_status AS ENUM ('paid', 'processing', 'rejected');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS depot_stock (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id uuid NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
        segment product_segment NOT NULL,
        on_hand integer NOT NULL DEFAULT 0,
        low_threshold integer NOT NULL DEFAULT 50,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS depot_stock_depot_segment_unique
        ON depot_stock (depot_id, segment)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id uuid NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
        segment product_segment NOT NULL,
        direction stock_movement_direction NOT NULL,
        qty integer NOT NULL,
        note text,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS scheme_claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        counter_id uuid NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
        depot_id uuid NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
        code varchar(40) NOT NULL,
        value integer NOT NULL,
        status scheme_claim_status NOT NULL DEFAULT 'processing',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    console.log("depot_stock, stock_movements, scheme_claims ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
