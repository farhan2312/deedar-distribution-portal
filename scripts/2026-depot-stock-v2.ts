import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Depot Stock v2 — matches the prototype's richer model:
 *   • stock_movements.type       5 movement types, replacing the in/out flag
 *   • stock_movements.qty        now SIGNED (negative = left the depot)
 *   • rep_user_id / wholesale_counter_id  who took the stock
 *   • depot_stock_days           daily closing balance + "closed" lock
 *
 * Backfills existing rows before dropping `direction`:
 *   inward  -> type 'inward',         qty stays positive
 *   outward -> type 'outward_retail', qty flipped negative
 * Idempotent — safe to re-run.
 */
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      DO $$ BEGIN
        CREATE TYPE stock_movement_type AS ENUM
          ('inward', 'outward_retail', 'outward_wholesale', 'returns', 'manual');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;

    await sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS type stock_movement_type`;
    await sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS rep_user_id uuid REFERENCES users(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS wholesale_counter_id uuid REFERENCES counters(id) ON DELETE SET NULL`;

    // Backfill only while the old column still exists (i.e. first run).
    const [{ has_direction }] = await sql<{ has_direction: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stock_movements' AND column_name = 'direction'
      ) AS has_direction
    `;
    if (has_direction) {
      const typed = await sql`
        UPDATE stock_movements
        SET type = CASE WHEN direction = 'inward' THEN 'inward'::stock_movement_type
                        ELSE 'outward_retail'::stock_movement_type END
        WHERE type IS NULL
      `;
      // Outward rows were stored as positive magnitudes; qty is signed now.
      const signed = await sql`
        UPDATE stock_movements SET qty = -ABS(qty) WHERE direction = 'outward' AND qty > 0
      `;
      console.log(`backfilled type on ${typed.count} row(s); flipped ${signed.count} outward qty negative`);
      await sql`ALTER TABLE stock_movements DROP COLUMN direction`;
      await sql`DROP TYPE IF EXISTS stock_movement_direction`;
    } else {
      console.log("direction column already removed — skipping backfill");
    }

    await sql`UPDATE stock_movements SET type = 'manual' WHERE type IS NULL`;
    await sql`ALTER TABLE stock_movements ALTER COLUMN type SET NOT NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS depot_stock_days (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id uuid NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
        stock_date date NOT NULL,
        closing jsonb NOT NULL DEFAULT '{}'::jsonb,
        total integer NOT NULL DEFAULT 0,
        closed boolean NOT NULL DEFAULT false,
        closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        closed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS depot_stock_days_depot_date_unique
        ON depot_stock_days (depot_id, stock_date)
    `;
    console.log("depot stock v2 schema ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
