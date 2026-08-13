import { config } from "dotenv";

config({ path: ".env.local" });

// Bind live location sharing to the device/session that started the day.
// Adds `tracking_device_id` to day_logs: the id of the browser that ran
// startDay(). A second login on the SAME account is refused a tracking
// ticket, so only the day-starter's device appears on the SO/C&F map.
// Nullable — existing in-flight rows stay unclaimed (allowed) until the next
// day is started fresh.
async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  try {
    await sql`
      ALTER TABLE day_logs
      ADD COLUMN IF NOT EXISTS tracking_device_id text
    `;
    console.log("day_logs.tracking_device_id ensured.");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
