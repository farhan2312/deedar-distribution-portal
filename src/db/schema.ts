import { sql } from "drizzle-orm";
import {
  integer,
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
  stock: integer("stock").notNull().default(0),
  // The field rep who added this counter — they can always visit it in their
  // beat, even if it sits outside their supervisor-assigned areas.
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
