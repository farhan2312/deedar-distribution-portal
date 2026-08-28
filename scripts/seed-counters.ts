import { config } from "dotenv";

config({ path: ".env.local" });

type SeedRow = {
  name: string;
  phone: string;
  type: "Kirana" | "Paan" | "Tea Stall" | "Wholesale" | "Vegetable Shop" | "Others";
  stockistName: string;
  areaName: string;
  lat: string;
  lng: string;
  stock: number;
  status: "active" | "dormant" | "declining";
};

const SEED: SeedRow[] = [
  { name: "Aashish Kirana Store", phone: "9829424970", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.723600", lng: "76.110400", stock: 20, status: "active" },
  { name: "Anuj Kirana Store", phone: "9929121610", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.722900", lng: "76.113200", stock: 0, status: "active" },
  { name: "Mina Paan", phone: "9772142558", type: "Paan", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.721500", lng: "76.116100", stock: 2, status: "active" },
  { name: "Prbykal Kirana Store", phone: "9983746881", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.738900", lng: "76.027900", stock: 5, status: "active" },
  { name: "Ravi Kirana", phone: "9982285190", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.738900", lng: "76.027800", stock: 5, status: "active" },
  { name: "Suresh Kirana Store", phone: "9636336584", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.799300", lng: "76.048900", stock: 6, status: "active" },
  { name: "Rathor Kirana", phone: "8104207884", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Karvar", lat: "25.721600", lng: "76.115700", stock: 30, status: "active" },
  { name: "Agrwal Kirana Ind.", phone: "9950400227", type: "Wholesale", stockistName: "Indergarh Depot", areaName: "Indergarh", lat: "25.732000", lng: "76.182400", stock: 30, status: "active" },
  { name: "Gocher Tea Store", phone: "9680397845", type: "Tea Stall", stockistName: "Indergarh Depot", areaName: "Indergarh", lat: "25.732200", lng: "76.181800", stock: 2, status: "dormant" },
  { name: "Rakesh Kirana", phone: "9461750242", type: "Kirana", stockistName: "Indergarh Depot", areaName: "Sumerganjmandi", lat: "25.695900", lng: "76.210800", stock: 4, status: "declining" },
];

async function main() {
  const { db } = await import("../src/db");
  const { counters, stockists, areas } = await import("../src/db/schema");

  const allStockists = await db.select().from(stockists);
  const allAreas = await db.select().from(areas);
  const depotByName = new Map(allStockists.map((d) => [d.name, d]));
  const areaByDepotAndName = new Map(
    allAreas.map((a) => [`${a.stockistId}::${a.name}`, a]),
  );

  const rows = SEED.map((s) => {
    const depot = depotByName.get(s.stockistName);
    if (!depot) throw new Error(`Unknown depot "${s.stockistName}" — seed the org hierarchy first.`);
    const area = areaByDepotAndName.get(`${depot.id}::${s.areaName}`);
    if (!area) throw new Error(`Unknown area "${s.areaName}" under "${s.stockistName}".`);
    return {
      name: s.name,
      phone: s.phone,
      type: s.type,
      stockistId: depot.id,
      areaId: area.id,
      lat: s.lat,
      lng: s.lng,
      stock: s.stock,
      status: s.status,
    };
  });

  const inserted = await db
    .insert(counters)
    .values(rows)
    .onConflictDoNothing({ target: counters.phone })
    .returning({ id: counters.id, name: counters.name });

  console.log(`Seeded ${inserted.length} new counter(s) (existing rows skipped).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
