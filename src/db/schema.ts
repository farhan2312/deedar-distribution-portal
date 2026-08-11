import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── Org hierarchy: State → C&F HQ → Depot → Area ────────────────────────

export const states = pgTable("states", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  country: varchar("country", { length: 120 }).notNull().default("India"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cnfs = pgTable("cnfs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  // One C&F HQ per state.
  stateId: uuid("state_id")
    .notNull()
    .unique()
    .references(() => states.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const depots = pgTable("depots", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  cnfId: uuid("cnf_id")
    .notNull()
    .references(() => cnfs.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    depotId: uuid("depot_id")
      .notNull()
      .references(() => depots.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("areas_depot_name_unique").on(t.depotId, t.name)],
);

// ── Users ─────────────────────────────────────────────────────────────

export const accessRoleEnum = pgEnum("access_role", [
  "field",
  "supervisor",
  "dealer",
  "hq",
  "khq",
  "admin",
]);

export type AccessRole = (typeof accessRoleEnum.enumValues)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 10 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  accessRoles: accessRoleEnum("access_roles")
    .array()
    .notNull()
    .default(sql`ARRAY[]::access_role[]`),
  // Single-scope roles: hq → cnfId, dealer/field → depotId.
  cnfId: uuid("cnf_id").references(() => cnfs.id, { onDelete: "set null" }),
  depotId: uuid("depot_id").references(() => depots.id, { onDelete: "set null" }),
  // A field salesman reports to one Supervisor (SO).
  reportsToUserId: uuid("reports_to_user_id").references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Multi-scope roles: supervisor → many depots.
export const userDepots = pgTable(
  "user_depots",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    depotId: uuid("depot_id")
      .notNull()
      .references(() => depots.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.depotId] })],
);

// Multi-scope roles: field → many areas (within their one depot).
export const userAreas = pgTable(
  "user_areas",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.areaId] })],
);

// Public "Request Access" signup: anyone can submit name/phone/password/role;
// an admin approves (creates the real `users` row) or rejects. Kept as its own
// table — not a `users` row with a "pending" flag — so unapproved signups
// never appear in role/depot scoping queries, which all read straight from
// `users`.
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const accessRequests = pgTable("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 10 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  requestedRole: accessRoleEnum("requested_role").notNull(),
  status: accessRequestStatusEnum("status").notNull().default("pending"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccessRequest = typeof accessRequests.$inferSelect;

// ── Counters ─────────────────────────────────────────────────────────

export const counterStatusEnum = pgEnum("counter_status", [
  "active",
  "dormant",
  "declining",
]);

export const counterTypeEnum = pgEnum("counter_type", [
  "Kirana",
  "Paan",
  "Tea Stall",
  "Wholesale",
  "Vegetable Shop",
  "Others",
]);

export const counters = pgTable("counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 10 }).unique(),
  type: counterTypeEnum("type").notNull(),
  depotId: uuid("depot_id")
    .notNull()
    .references(() => depots.id, { onDelete: "restrict" }),
  areaId: uuid("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "restrict" }),
  address: text("address"),
  lat: numeric("lat", { precision: 10, scale: 6 }),
  lng: numeric("lng", { precision: 10, scale: 6 }),
  status: counterStatusEnum("status").notNull().default("active"),
  // Stock is observed per-visit, not a counter attribute — see visits.items.
  // The field rep who added this counter — they can always visit it in their
  // beat, even if it sits outside their supervisor-assigned areas.
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Field activity ────────────────────────────────────────────────────

// One row per field rep per day (day boundaries computed in IST). Tracks the
// rep's on-the-clock start/end for the day.
export const dayLogs = pgTable(
  "day_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(), // IST calendar day, YYYY-MM-DD
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    // Set when a Supervisor force-closes a day the rep forgot to end (see the
    // Supervisor "Exceptions" screen). `endForced` marks endAt as SO-stamped.
    endForced: boolean("end_forced").notNull().default(false),
    endedByUserId: uuid("ended_by_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("day_logs_user_date_unique").on(t.userId, t.logDate)],
);

// A counter a Supervisor (SO) hands to a field rep for a specific IST day.
// A field rep's Beat = counters they created themselves UNION counters
// assigned to them here for today. (No other visibility source.)
export const beatAssignments = pgTable(
  "beat_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repUserId: uuid("rep_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    counterId: uuid("counter_id")
      .notNull()
      .references(() => counters.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    beatDate: date("beat_date").notNull(), // IST calendar day, YYYY-MM-DD
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("beat_assignments_rep_counter_date_unique").on(t.repUserId, t.counterId, t.beatDate)],
);

export const competitorPresenceEnum = pgEnum("competitor_presence", [
  "none",
  "local",
  "national",
]);

export const productSegmentEnum = pgEnum("product_segment", [
  "DG10",
  "DG20",
  "DB20",
  "DB40",
]);

export type ProductSegment = (typeof productSegmentEnum.enumValues)[number];
export type CompetitorPresence = (typeof competitorPresenceEnum.enumValues)[number];

/** One SKU line inside a visit, stored in the visits.items JSONB column. */
export type VisitItem = { segment: ProductSegment; stock: number; sold: number };

// A field rep's visit to a counter. `stock`/`sold` are totals across `items`.
export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  counterId: uuid("counter_id")
    .notNull()
    .references(() => counters.id, { onDelete: "cascade" }),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  stock: integer("stock").notNull().default(0),
  sold: integer("sold").notNull().default(0),
  items: jsonb("items").$type<VisitItem[]>().notNull().default([]),
  rank: integer("rank"),
  competitor: competitorPresenceEnum("competitor"),
  remarks: text("remarks"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type State = typeof states.$inferSelect;
export type Cnf = typeof cnfs.$inferSelect;
export type Depot = typeof depots.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Counter = typeof counters.$inferSelect;
export type NewCounter = typeof counters.$inferInsert;
export type DayLog = typeof dayLogs.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type BeatAssignment = typeof beatAssignments.$inferSelect;
