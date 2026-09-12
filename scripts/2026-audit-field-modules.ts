import { config } from "dotenv";

config({ path: ".env.local" });

// The audit log only ever had modules for the admin screens, so every counter,
// visit, beat, day log and stock movement was written with nobody recording
// who did it. These five values are what the field-side actions now log under.
//
// ADD VALUE is applied one statement at a time: Postgres refuses to use a new
// enum value in the same transaction that created it, and a multi-statement
// template would put them all in one.
const NEW_MODULES = ["counters", "visits", "daylogs", "beats", "stock"];

async function main() {
  const apply = process.argv.includes("--apply");
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    const existing = await sql<{ label: string }[]>`
      SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_module'
      ORDER BY e.enumsortorder
    `;
    const have = new Set(existing.map((r) => r.label));
    console.log("audit_module now:", [...have].join(", "));

    const missing = NEW_MODULES.filter((m) => !have.has(m));
    if (missing.length === 0) {
      console.log("Nothing to add.");
      return;
    }
    console.log((apply ? "Adding: " : "Would add: ") + missing.join(", "));
    if (!apply) {
      console.log("Dry run. Re-run with --apply to write.");
      return;
    }
    for (const label of missing) {
      await sql.unsafe(`ALTER TYPE audit_module ADD VALUE IF NOT EXISTS '${label}'`);
      console.log("  added", label);
    }
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
