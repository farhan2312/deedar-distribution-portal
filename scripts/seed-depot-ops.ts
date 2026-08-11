import { config } from "dotenv";

config({ path: ".env.local" });

import type { ProductSegment } from "../src/db/schema";

// Seeds depot_stock (4 SKUs per depot), a few movements today, and some scheme
// claims per depot. Idempotent: stock uses onConflictDoNothing; movements and
// claims are only inserted when a depot has none yet.
const STOCK: { segment: ProductSegment; onHand: number; low: number }[] = [
  { segment: "DG10", onHand: 320, low: 60 },
  { segment: "DG20", onHand: 42, low: 60 }, // low
  { segment: "DB20", onHand: 180, low: 50 },
  { segment: "DB40", onHand: 0, low: 40 }, // out
];

async function main() {
  const { db } = await import("../src/db");
  const { depots, counters, depotStock, stockMovements, schemeClaims } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const allDepots = await db.select().from(depots);
  if (allDepots.length === 0) {
    console.log("No depots — seed the org hierarchy first.");
    process.exit(0);
  }

  let stockRows = 0;
  let movementRows = 0;
  let claimRows = 0;

  for (const depot of allDepots) {
    // Stock — one row per SKU (skip if already present).
    await db
      .insert(depotStock)
      .values(STOCK.map((s) => ({ depotId: depot.id, segment: s.segment, onHand: s.onHand, lowThreshold: s.low })))
      .onConflictDoNothing();
    stockRows += STOCK.length;

    // Movements today — only if this depot has none.
    const existingMoves = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.depotId, depot.id))
      .limit(1);
    if (existingMoves.length === 0) {
      const moves = [
        { depotId: depot.id, segment: "DG10" as ProductSegment, direction: "inward" as const, qty: 200, note: "Factory dispatch received" },
        { depotId: depot.id, segment: "DB20" as ProductSegment, direction: "outward" as const, qty: 60, note: "Bora lifting — wholesale" },
        { depotId: depot.id, segment: "DG20" as ProductSegment, direction: "outward" as const, qty: 18, note: "Counter bulk order" },
      ];
      await db.insert(stockMovements).values(moves);
      movementRows += moves.length;
    }

    // Scheme claims — only if this depot has none. Attach to up to 3 counters.
    const existingClaims = await db
      .select({ id: schemeClaims.id })
      .from(schemeClaims)
      .where(eq(schemeClaims.depotId, depot.id))
      .limit(1);
    if (existingClaims.length === 0) {
      const depotCounters = await db
        .select({ id: counters.id })
        .from(counters)
        .where(eq(counters.depotId, depot.id))
        .limit(3);
      if (depotCounters.length > 0) {
        const statuses = ["paid", "processing", "paid"] as const;
        const codes = ["DEE-2024-A", "MONSOON-50", "DEE-2024-B"];
        const values = [250, 120, 400];
        const claims = depotCounters.map((c, i) => ({
          counterId: c.id,
          depotId: depot.id,
          code: codes[i % codes.length],
          value: values[i % values.length],
          status: statuses[i % statuses.length],
        }));
        await db.insert(schemeClaims).values(claims);
        claimRows += claims.length;
      }
    }
  }

  console.log(`Seeded across ${allDepots.length} depot(s): ~${stockRows} stock rows (existing skipped), ${movementRows} movements, ${claimRows} claims.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
