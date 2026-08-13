import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Full demo dataset for local testing: org hierarchy → users → counters →
 * day logs → visits → beat assignments → live positions → depot stock.
 *
 * Idempotent: every insert either conflict-skips or is guarded by a lookup,
 * so re-running tops the data up rather than duplicating it.
 *
 * DEV ONLY — every seeded user shares one well-known password.
 */
const DEMO_PASSWORD = "deedar123";

// ── Hierarchy blueprint ─────────────────────────────────────────────────
// Two states, one C&F each, four depots per C&F, 5–6 areas per depot.
// Depot coordinates are real so the Leaflet map lands somewhere sensible.
type DepotSpec = { name: string; lat: number; lng: number; areas: string[] };
type StateSpec = { state: string; cnf: string; depots: DepotSpec[] };

const BLUEPRINT: StateSpec[] = [
  {
    state: "Rajasthan",
    cnf: "Jhalawar C&F HQ",
    depots: [
      {
        name: "Indergarh Depot",
        lat: 25.732,
        lng: 76.1824,
        areas: ["Karvar", "Indergarh", "Sumerganjmandi", "Lakheri", "Kaithun", "Deoli"],
      },
      {
        name: "Kota Depot",
        lat: 25.2138,
        lng: 75.8648,
        areas: ["Dadabari", "Talwandi", "Gumanpura", "Borkhera", "Mahaveer Nagar"],
      },
      {
        name: "Baran Depot",
        lat: 25.1,
        lng: 76.5167,
        areas: ["Baran City", "Anta", "Mangrol", "Chhabra", "Atru", "Shahabad"],
      },
      {
        name: "Jhalawar Depot",
        lat: 24.5967,
        lng: 76.1653,
        areas: ["Jhalrapatan", "Bhawani Mandi", "Aklera", "Khanpur", "Pirawa"],
      },
    ],
  },
  {
    state: "Bihar",
    cnf: "Patna C&F HQ",
    depots: [
      {
        name: "Patna Depot",
        lat: 25.5941,
        lng: 85.1376,
        areas: ["Kankarbagh", "Boring Road", "Danapur", "Patna City", "Phulwari Sharif", "Rajendra Nagar"],
      },
      {
        name: "Gaya Depot",
        lat: 24.7955,
        lng: 84.9994,
        areas: ["Gaya City", "Bodh Gaya", "Sherghati", "Tekari", "Manpur"],
      },
      {
        name: "Muzaffarpur Depot",
        lat: 26.1209,
        lng: 85.3647,
        areas: ["Motijheel", "Mithanpura", "Kanti", "Sakra", "Bochaha", "Aurai"],
      },
      {
        name: "Bhagalpur Depot",
        lat: 25.2425,
        lng: 86.9842,
        areas: ["Tilkamanjhi", "Nathnagar", "Sultanganj", "Kahalgaon", "Naugachia"],
      },
    ],
  },
];

const COUNTER_TYPES = ["Kirana", "Paan", "Tea Stall", "Wholesale", "Vegetable Shop", "Others"] as const;
const SEGMENTS = ["DG10", "DG20", "DB20", "DB40"] as const;
const COMPETITORS = ["none", "local", "national"] as const;

const SHOP_PREFIX = [
  "Shree", "Maa", "New", "Balaji", "Krishna", "Ganesh", "Laxmi", "Bharat",
  "Jai", "Sai", "Anand", "Gupta", "Sharma", "Verma", "Raj", "Sunrise",
];
const SHOP_SUFFIX = [
  "Kirana Store", "General Store", "Provision Store", "Traders", "Pan Bhandar",
  "Tea Stall", "Sweets", "Enterprises", "Store", "Kirana",
];

const FIRST_NAMES = [
  "Hukum Chand", "Sagar", "Ramesh", "Dinesh", "Manoj", "Rakesh", "Vijay", "Ajay",
  "Sunil", "Anil", "Pankaj", "Arun", "Deepak", "Sanjay", "Rohit", "Amit",
  "Naveen", "Praveen", "Suresh", "Mahesh", "Vikas", "Nitin", "Alok", "Gaurav",
];
const LAST_NAMES = [
  "Saini", "Rawat", "Sharma", "Verma", "Kumar", "Singh", "Yadav", "Gupta",
  "Meena", "Jain", "Prasad", "Mishra",
];

/** Deterministic PRNG so repeat runs produce identical data. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rng = makeRng(20260812);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** Scatter a point within roughly `km` of an origin. */
function jitter(lat: number, lng: number, km: number): { lat: string; lng: string } {
  const dLat = (rng() - 0.5) * 2 * (km / 111);
  const dLng = (rng() - 0.5) * 2 * (km / (111 * Math.cos((lat * Math.PI) / 180)));
  return { lat: (lat + dLat).toFixed(6), lng: (lng + dLng).toFixed(6) };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDate = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
/** A UTC instant for a given IST calendar day + local hour/minute. */
function istInstant(dayOffset: number, hour: number, minute = 0): Date {
  const day = istDate(new Date(Date.now() + dayOffset * 86_400_000));
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000+05:30`);
}

let phoneSeq = 9000000000;
const nextPhone = () => String(++phoneSeq);

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }

  const { db } = await import("../src/db");
  const {
    states, cnfs, depots, areas, users, userAreas, userDepots,
    counters, visits, dayLogs, beatAssignments, repLocations,
    depotStock, stockMovements, schemeClaims,
  } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { and, eq } = await import("drizzle-orm");

  const passwordHash = await hashPassword(DEMO_PASSWORD); // one hash, reused
  const credentials: { role: string; name: string; phone: string; scope: string }[] = [];

  // ── 1. States → C&F → depots → areas ──────────────────────────────────
  const depotIndex: { id: string; name: string; spec: DepotSpec; areaIds: { id: string; name: string }[] }[] = [];

  for (const s of BLUEPRINT) {
    await db.insert(states).values({ name: s.state }).onConflictDoNothing();
    const [stateRow] = await db.select().from(states).where(eq(states.name, s.state)).limit(1);

    await db.insert(cnfs).values({ name: s.cnf, stateId: stateRow.id }).onConflictDoNothing();
    const [cnfRow] = await db.select().from(cnfs).where(eq(cnfs.name, s.cnf)).limit(1);

    for (const d of s.depots) {
      await db.insert(depots).values({ name: d.name, cnfId: cnfRow.id }).onConflictDoNothing();
      const [depotRow] = await db.select().from(depots).where(eq(depots.name, d.name)).limit(1);

      await db
        .insert(areas)
        .values(d.areas.map((name) => ({ name, depotId: depotRow.id })))
        .onConflictDoNothing();
      const areaRows = await db.select().from(areas).where(eq(areas.depotId, depotRow.id));

      depotIndex.push({
        id: depotRow.id,
        name: d.name,
        spec: d,
        areaIds: areaRows.map((a) => ({ id: a.id, name: a.name })),
      });
    }
  }
  console.log(`Hierarchy: ${BLUEPRINT.length} states · ${BLUEPRINT.length} C&F · ${depotIndex.length} depots · ${depotIndex.reduce((n, d) => n + d.areaIds.length, 0)} areas`);

  // ── 2. Users ──────────────────────────────────────────────────────────
  // Per C&F: 2 Sales Officers, each supervising 2 depots.
  // Per depot: 2 field ISRs (reporting to that depot's SO) + 1 depot user.
  async function ensureUser(v: {
    name: string; phone: string; roles: ("field" | "supervisor" | "dealer" | "hq" | "khq" | "admin")[];
    depotId?: string | null; cnfId?: string | null; reportsToUserId?: string | null;
  }) {
    const [existing] = await db.select().from(users).where(eq(users.phone, v.phone)).limit(1);
    if (existing) return existing;
    const [row] = await db
      .insert(users)
      .values({
        name: v.name, phone: v.phone, passwordHash, accessRoles: v.roles,
        depotId: v.depotId ?? null, cnfId: v.cnfId ?? null, reportsToUserId: v.reportsToUserId ?? null,
      })
      .returning();
    return row;
  }

  const soByDepot = new Map<string, string>();
  const fieldReps: { id: string; name: string; depotId: string; depotIdx: number }[] = [];

  let nameSeq = 0;
  const nextName = () => `${FIRST_NAMES[nameSeq++ % FIRST_NAMES.length]} ${pick(LAST_NAMES)}`;

  for (let s = 0; s < BLUEPRINT.length; s++) {
    const stateDepots = depotIndex.slice(s * 4, s * 4 + 4);
    const [cnfRow] = await db.select().from(cnfs).where(eq(cnfs.name, BLUEPRINT[s].cnf)).limit(1);

    for (let pair = 0; pair < 2; pair++) {
      const covered = stateDepots.slice(pair * 2, pair * 2 + 2);
      const so = await ensureUser({
        name: nextName(), phone: nextPhone(), roles: ["supervisor"], cnfId: cnfRow.id,
      });
      credentials.push({ role: "Sales Officer", name: so.name, phone: so.phone, scope: covered.map((c) => c.name).join(" + ") });

      for (const d of covered) {
        soByDepot.set(d.id, so.id);
        await db.insert(userDepots).values({ userId: so.id, depotId: d.id }).onConflictDoNothing();
      }
    }

    for (const d of stateDepots) {
      const depotIdx = depotIndex.findIndex((x) => x.id === d.id);
      for (let r = 0; r < 2; r++) {
        const rep = await ensureUser({
          name: nextName(), phone: nextPhone(), roles: ["field"],
          depotId: d.id, reportsToUserId: soByDepot.get(d.id),
        });
        credentials.push({ role: "Field ISR", name: rep.name, phone: rep.phone, scope: d.name });
        fieldReps.push({ id: rep.id, name: rep.name, depotId: d.id, depotIdx });
        // Cover roughly half the depot's areas each.
        for (const a of d.areaIds.filter((_, i) => i % 2 === r)) {
          await db.insert(userAreas).values({ userId: rep.id, areaId: a.id }).onConflictDoNothing();
        }
      }
      const depotUser = await ensureUser({
        name: `${d.name.replace(" Depot", "")} Depot Manager`, phone: nextPhone(),
        roles: ["dealer"], depotId: d.id,
      });
      credentials.push({ role: "Depot", name: depotUser.name, phone: depotUser.phone, scope: d.name });
    }
  }
  console.log(`Users: ${credentials.length} seeded (password for all: ${DEMO_PASSWORD})`);

  // ── 3. Counters ───────────────────────────────────────────────────────
  const countersByDepot = new Map<string, { id: string; areaId: string }[]>();
  for (const d of depotIndex) {
    const existing = await db.select({ id: counters.id, areaId: counters.areaId }).from(counters).where(eq(counters.depotId, d.id));
    const target = 10;
    const toAdd = Math.max(0, target - existing.length);
    const creator = fieldReps.find((r) => r.depotId === d.id)?.id ?? null;

    if (toAdd > 0) {
      const rows = Array.from({ length: toAdd }, () => {
        const area = pick(d.areaIds);
        const gps = jitter(d.spec.lat, d.spec.lng, 6);
        return {
          name: `${pick(SHOP_PREFIX)} ${pick(SHOP_SUFFIX)}`,
          phone: nextPhone(),
          type: pick(COUNTER_TYPES),
          depotId: d.id,
          areaId: area.id,
          address: `${area.name}, ${d.name.replace(" Depot", "")}`,
          lat: gps.lat,
          lng: gps.lng,
          status: (rng() < 0.15 ? "declining" : rng() < 0.25 ? "dormant" : "active") as "active" | "dormant" | "declining",
          createdByUserId: creator,
        };
      });
      await db.insert(counters).values(rows).onConflictDoNothing({ target: counters.phone });
    }
    countersByDepot.set(
      d.id,
      await db.select({ id: counters.id, areaId: counters.areaId }).from(counters).where(eq(counters.depotId, d.id)),
    );
  }
  console.log(`Counters: ${[...countersByDepot.values()].reduce((n, c) => n + c.length, 0)} total across ${depotIndex.length} depots`);

  // ── 4. Day logs — last 7 IST days ─────────────────────────────────────
  // Today: most reps clocked in and still running (so the live map has
  // markers); one rep left a PAST day open so /supervisor/exceptions has work.
  let dayLogCount = 0;
  const activeToday: typeof fieldReps = [];

  for (let i = 0; i < fieldReps.length; i++) {
    const rep = fieldReps[i];
    for (let back = 6; back >= 0; back--) {
      const logDate = istDate(new Date(Date.now() - back * 86_400_000));
      const [existing] = await db
        .select({ id: dayLogs.id })
        .from(dayLogs)
        .where(and(eq(dayLogs.userId, rep.id), eq(dayLogs.logDate, logDate)))
        .limit(1);
      if (existing) continue;

      const startAt = istInstant(-back, 9, int(0, 45));
      const isToday = back === 0;
      // Every 7th rep forgets to clock out on the oldest day.
      const forgot = !isToday && back === 6 && i % 7 === 0;
      const endAt = isToday || forgot ? null : istInstant(-back, int(17, 18), int(0, 55));

      // Roughly 80% of reps are on the clock today.
      if (isToday && i % 5 === 4) continue; // this rep hasn't started today
      await db.insert(dayLogs).values({ userId: rep.id, logDate, startAt, endAt });
      dayLogCount++;
      if (isToday) activeToday.push(rep);
    }
  }
  console.log(`Day logs: ${dayLogCount} rows · ${activeToday.length}/${fieldReps.length} reps on the clock today`);

  // ── 5. Visits — last 7 days ───────────────────────────────────────────
  // Built in memory then written in bulk: one INSERT per rep instead of one
  // per visit, which matters a lot against a remote database.
  let visitCount = 0;
  const lastVisitByCounter = new Map<string, Date>();

  for (const rep of fieldReps) {
    const pool = countersByDepot.get(rep.depotId) ?? [];
    if (pool.length === 0) continue;

    // Skip reps that already have visits, so re-runs don't pile more on.
    const [seen] = await db.select({ id: visits.id }).from(visits).where(eq(visits.userId, rep.id)).limit(1);
    if (seen) continue;

    const batch: (typeof visits.$inferInsert)[] = [];
    for (let back = 6; back >= 0; back--) {
      const perDay = back === 0 ? int(2, 5) : int(4, 8);
      for (let v = 0; v < perDay; v++) {
        const counter = pick(pool);
        const visitedAt = istInstant(-back, int(9, 17), int(0, 59));

        const items = SEGMENTS.map((segment) => ({
          segment,
          stock: int(0, 30),
          sold: rng() < 0.55 ? int(1, 6) : 0,
        }));
        // Honour the 24-packet cap enforced by the visit form.
        let total = items.reduce((n, it) => n + it.sold, 0);
        while (total > 24) {
          const target = pick(items.filter((it) => it.sold > 0));
          target.sold -= 1;
          total -= 1;
        }

        batch.push({
          userId: rep.id,
          counterId: counter.id,
          visitedAt,
          stock: items.reduce((n, it) => n + it.stock, 0),
          sold: total,
          items,
          rank: rng() < 0.2 ? null : int(1, 3),
          competitor: pick(COMPETITORS),
          remarks: rng() < 0.3 ? pick(["Asked for bigger visi-cooler", "Wants scheme details", "Stock moving slow", "Requested more DG10"]) : null,
          durationSeconds: int(90, 900),
          updatedAt: visitedAt,
        });

        const prev = lastVisitByCounter.get(counter.id);
        if (!prev || visitedAt > prev) lastVisitByCounter.set(counter.id, visitedAt);
      }
    }
    if (batch.length > 0) {
      await db.insert(visits).values(batch);
      visitCount += batch.length;
    }
  }

  // One update per touched counter rather than one per visit.
  for (const [counterId, at] of lastVisitByCounter) {
    await db.update(counters).set({ lastVisitAt: at }).where(eq(counters.id, counterId));
  }
  console.log(`Visits: ${visitCount} recorded over the last 7 days`);

  // ── 6. Beat assignments — today + tomorrow ────────────────────────────
  let beatCount = 0;
  for (const rep of fieldReps) {
    const pool = countersByDepot.get(rep.depotId) ?? [];
    const so = soByDepot.get(rep.depotId) ?? null;
    for (const offset of [0, 1]) {
      const beatDate = istDate(new Date(Date.now() + offset * 86_400_000));
      const chosen = [...pool].sort(() => rng() - 0.5).slice(0, int(4, 6));
      if (chosen.length === 0) continue;
      const res = await db
        .insert(beatAssignments)
        .values(chosen.map((c) => ({ repUserId: rep.id, counterId: c.id, assignedByUserId: so, beatDate })))
        .onConflictDoNothing()
        .returning({ id: beatAssignments.id });
      beatCount += res.length;
    }
  }
  console.log(`Beat assignments: ${beatCount} counters assigned for today + tomorrow`);

  // ── 7. Live positions for reps on the clock ───────────────────────────
  for (const rep of activeToday) {
    const d = depotIndex[rep.depotIdx];
    const gps = jitter(d.spec.lat, d.spec.lng, 5);
    await db
      .insert(repLocations)
      .values({
        userId: rep.id,
        lat: gps.lat,
        lng: gps.lng,
        accuracyM: int(8, 45),
        recordedAt: new Date(Date.now() - int(0, 4) * 60_000),
      })
      .onConflictDoUpdate({
        target: repLocations.userId,
        set: { lat: gps.lat, lng: gps.lng, recordedAt: new Date(), updatedAt: new Date() },
      });
  }
  console.log(`Live positions: ${activeToday.length} reps placed on the map`);

  // ── 8. Depot stock, movements, scheme claims ──────────────────────────
  let stockRows = 0, movementRows = 0, claimRows = 0;
  for (const d of depotIndex) {
    const existing = await db.select({ id: depotStock.id }).from(depotStock).where(eq(depotStock.depotId, d.id));
    if (existing.length === 0) {
      await db.insert(depotStock).values(
        SEGMENTS.map((segment) => ({
          depotId: d.id,
          segment,
          onHand: rng() < 0.25 ? int(0, 40) : int(90, 400),
          lowThreshold: 50,
        })),
      ).onConflictDoNothing();
      stockRows += SEGMENTS.length;
    }

    const moves = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.depotId, d.id)).limit(1);
    if (moves.length === 0) {
      // qty is signed — outward movements are negative.
      await db.insert(stockMovements).values([
        { depotId: d.id, segment: "DG10" as const, type: "inward" as const, qty: int(150, 400), note: "Factory dispatch received" },
        { depotId: d.id, segment: "DB20" as const, type: "outward_wholesale" as const, qty: -int(30, 90), note: "Bora lifting — wholesale" },
        { depotId: d.id, segment: "DG20" as const, type: "outward_retail" as const, qty: -int(10, 40), note: "Field beat lifting" },
      ]);
      movementRows += 3;
    }

    const claims = await db.select({ id: schemeClaims.id }).from(schemeClaims).where(eq(schemeClaims.depotId, d.id)).limit(1);
    if (claims.length === 0) {
      const pool = (countersByDepot.get(d.id) ?? []).slice(0, 3);
      if (pool.length > 0) {
        await db.insert(schemeClaims).values(
          pool.map((c, i) => ({
            counterId: c.id,
            depotId: d.id,
            code: pick(["DEE-2026-A", "MONSOON-50", "DEE-2026-B", "FESTIVE-100"]),
            value: [250, 120, 400][i % 3],
            status: (["paid", "processing", "paid"] as const)[i % 3],
          })),
        );
        claimRows += pool.length;
      }
    }
  }
  console.log(`Depot ops: ${stockRows} stock rows · ${movementRows} movements · ${claimRows} scheme claims`);

  // ── Login sheet ───────────────────────────────────────────────────────
  console.log(`\n=== Demo logins (password for every account: ${DEMO_PASSWORD}) ===`);
  console.table(credentials);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
