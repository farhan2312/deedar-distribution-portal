import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
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

// ── Org hierarchy: State → C&F HQ → Stockist → Area ─────────────────────

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

/**
 * A stockist: whoever holds stock and owns areas beneath a C&F.
 *
 * Depot, Dealer and Sub-Dealer are one table because they behave
 * identically — each holds tracked stock, owns areas, and has ISRs drawing
 * their daily pickup from it. Only the label differs, plus a parent for the
 * one optional tier. Three tables would have forced every area, stock row,
 * user and dashboard query into a three-way branch for no behavioural gain.
 */
export const stockistKindEnum = pgEnum("stockist_kind", [
  // Stock the C&F manages itself.
  "depot",
  // Third-party stockist holding their own stock.
  "dealer",
  // Optional tier under a dealer. Exactly one level — a sub-dealer is never
  // itself a parent.
  "sub_dealer",
]);

export type StockistKind = (typeof stockistKindEnum.enumValues)[number];

export const stockists = pgTable(
  "stockists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull().unique(),
    cnfId: uuid("cnf_id")
      .notNull()
      .references(() => cnfs.id, { onDelete: "restrict" }),
    kind: stockistKindEnum("kind").notNull().default("depot"),
    // Set only on a sub-dealer, and always pointing at a dealer. A DB CHECK
    // enforces the shape; `restrict` stops a dealer being deleted out from
    // under its sub-dealers.
    parentId: uuid("parent_id").references((): AnyPgColumn => stockists.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stockists_cnf_kind_idx").on(t.cnfId, t.kind)],
);

export type Stockist = typeof stockists.$inferSelect;

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    stockistId: uuid("stockist_id")
      .notNull()
      .references(() => stockists.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("areas_stockist_name_unique").on(t.stockistId, t.name)],
);

// ── Users ─────────────────────────────────────────────────────────────

export const accessRoleEnum = pgEnum("access_role", [
  "field",
  "supervisor",
  // The C&F-managed stockist. Renamed from "dealer", which is what this role
  // always meant; that name now belongs to the third-party stockist below.
  "depot",
  "hq",
  "khq",
  "admin",
  // Third-party stockist, and sub-dealers under one.
  "dealer",
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
  // Single-scope roles: hq → cnfId, dealer/field → stockistId.
  cnfId: uuid("cnf_id").references(() => cnfs.id, { onDelete: "set null" }),
  stockistId: uuid("stockist_id").references(() => stockists.id, { onDelete: "set null" }),
  // A field salesman reports to one Supervisor (SO).
  reportsToUserId: uuid("reports_to_user_id").references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
  // Set when admin creates a user (their password is their phone number, a
  // guessable bootstrap). While true the app forces them to /account/change-
  // password before anything else; changing the password clears it. Users who
  // set their own password via signup are created with this false.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Soft-disable: a deactivated user can't log in and is treated as logged-out
  // on their next request, but all their data (visits, counters) is preserved.
  // The reversible alternative to deletion — see `setUserActive`.
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Multi-scope roles: supervisor → many stockists.
export const userStockists = pgTable(
  "user_stockists",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stockistId: uuid("stockist_id")
      .notNull()
      .references(() => stockists.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.stockistId] })],
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

// ── Password reset requests ──────────────────────────────────────────
// A user who has forgotten their password asks here; an admin resolves it
// from Users & Access. Deliberately NOT self-service: there is no email or
// SMS channel in this app, so there is nothing to send a reset link over —
// the admin is the out-of-band step that proves who is asking.

export const passwordResetStatusEnum = pgEnum("password_reset_status", [
  "pending",
  "done",
  "dismissed",
]);

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The number as typed. Kept even when it matches no account, so an admin
  // can see someone is locked out under a number nobody registered.
  phone: varchar("phone", { length: 10 }).notNull(),
  // Resolved at request time when the number matches an account; null when it
  // does not. The request page never says which, so a stranger cannot use it
  // to discover whether a number is registered.
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  status: passwordResetStatusEnum("status").notNull().default("pending"),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;

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
  // Free-text label when `type` is "Others" (e.g. "Medical Store"). Null for
  // every other type. Display uses this in place of "Others" when present.
  typeOther: varchar("type_other", { length: 60 }),
  stockistId: uuid("stockist_id")
    .notNull()
    .references(() => stockists.id, { onDelete: "restrict" }),
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
/** One SKU line in a day-log stock count (pickup at start, remaining at end).
 * Deliberately a separate shape from `VisitItem`: a visit records two numbers
 * per SKU (stock seen, packets sold), whereas a day-log line is a single
 * quantity the rep is carrying. */
export type DayStockItem = { segment: ProductSegment; qty: number };

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
    // Device/session that STARTED the day, and therefore owns live location
    // sharing for it. If the same account logs in on a second device, that
    // device gets no tracking ticket (see `issueRepTicket`) — so only the
    // day-starter's device streams to the SO/C&F map, never two at once.
    // Null on rows started before this was introduced (treated as unclaimed).
    trackingDeviceId: text("tracking_device_id"),
    // Stock the rep collects from the depot at start of day, and what's left
    // on them at end of day — per SKU, mirroring `visits.items`, so the day
    // reconciles against the visits recorded in between (picked up − sold =
    // remaining). Totals are kept alongside for cheap aggregation, exactly as
    // `visits` keeps stock/sold next to its items JSONB.
    pickupItems: jsonb("pickup_items").$type<DayStockItem[]>().notNull().default([]),
    pickupTotal: integer("pickup_total").notNull().default(0),
    remainingItems: jsonb("remaining_items").$type<DayStockItem[]>().notNull().default([]),
    remainingTotal: integer("remaining_total").notNull().default(0),
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
export const visits = pgTable(
  "visits",
  {
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
    // Free-text brand name when `competitor` is "local" or "national" (e.g.
    // "Tata Tea", "Wagh Bakri"). Null when competitor is "none" or unset.
    competitorBrand: varchar("competitor_brand", { length: 80 }),
    remarks: text("remarks"),
    // Seconds spent on the counter — sampled from the client-side "time on
    // counter" timer at submit. Null for older rows recorded before the timer
    // was introduced. Not present for edits (kept from the original visit).
    durationSeconds: integer("duration_seconds"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // The IST calendar day this visit belongs to, written on insert.
    //
    // Redundant with `visited_at`, and deliberately so: a unique index cannot
    // be built on `(visited_at AT TIME ZONE 'Asia/Kolkata')::date`, because
    // `AT TIME ZONE` is STABLE rather than IMMUTABLE (the tz database can
    // change) and Postgres refuses to index it. A stored column can be.
    //
    // NULL on every row written before this column existed. That is what makes
    // the index below buildable without editing history: it is partial, so
    // those rows — which include counter+day duplicates predating the rule —
    // are simply not in it.
    visitDate: date("visit_date"),
  },
  (t) => [
    // One visit per counter per IST day, whoever the rep is. `createVisit`
    // checks the same rule first and reports it in words; this is the backstop
    // that two simultaneous submits cannot slip past.
    uniqueIndex("visits_counter_day_unique")
      .on(t.counterId, t.visitDate)
      .where(sql`${t.visitDate} is not null`),
  ],
);

// ── Bug / feature reports ───────────────────────────────────────────────
// Filed from the "Report a Bug" button in the top bar; reviewed by admin in
// the Bug Tracker.
export const bugTypeEnum = pgEnum("bug_type", ["bug", "feature"]);
export const bugSeverityEnum = pgEnum("bug_severity", ["low", "medium", "high", "critical"]);
export const bugStatusEnum = pgEnum("bug_status", ["open", "in_progress", "resolved", "closed"]);

export const bugReports = pgTable("bug_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: bugTypeEnum("type").notNull().default("bug"),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  severity: bugSeverityEnum("severity").notNull().default("medium"),
  /** Route the reporter was on, prefilled from the client but editable. */
  page: varchar("page", { length: 300 }),
  /** Optional screenshot as a data URL. Kept in a separate column that list
   * queries never SELECT, so large images don't bloat the tracker listing. */
  screenshot: text("screenshot"),
  reportedByUserId: uuid("reported_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: bugStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type BugType = (typeof bugTypeEnum.enumValues)[number];
export type BugSeverity = (typeof bugSeverityEnum.enumValues)[number];
export type BugStatus = (typeof bugStatusEnum.enumValues)[number];

// ── Realtime location ───────────────────────────────────────────────────
// LATEST known position per field rep — exactly one row per user, UPDATEd in
// place by the WebSocket service. Deliberately NOT a location history table:
// nothing in the app needs a GPS breadcrumb trail, so we don't retain one.
export const repLocations = pgTable("rep_locations", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lat: numeric("lat", { precision: 10, scale: 6 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 6 }).notNull(),
  accuracyM: integer("accuracy_m"),
  // Device clock time of the GPS fix vs. our own receive time — the latter is
  // what "is this device still alive" checks should use.
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RepLocation = typeof repLocations.$inferSelect;

// ── Depot operations: SKU stock, movements, scheme claims ───────────────
// The Depot portal (role key `dealer`, shown as "Depot") tracks per-depot
// inventory of the four product SKUs, an inward/outward movement log, and
// retailer scheme payouts.

// Current on-hand quantity per depot per SKU segment. Unique on (depot, segment).
export const stockistStock = pgTable(
  "stockist_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockistId: uuid("stockist_id")
      .notNull()
      .references(() => stockists.id, { onDelete: "cascade" }),
    segment: productSegmentEnum("segment").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    lowThreshold: integer("low_threshold").notNull().default(50),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stockist_stock_segment_unique").on(t.stockistId, t.segment)],
);

/** How stock left or entered the depot. Drives both the sign of `qty` and
 * which extra field is required (rep for retail, counter for wholesale). */
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "inward", // received from C&F
  "outward_retail", // lifted by a field rep for their beat
  "outward_wholesale", // bora lifting by a wholesale counter
  "returns", // returns / damage
  "manual", // manual adjustment; qty may be negative
]);

// Movement log. `qty` is SIGNED (negative = stock left the depot) so the
// running balance is a plain sum. Applying a movement adjusts the matching
// depot_stock.on_hand and re-stamps that day's closing balance.
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockistId: uuid("stockist_id")
    .notNull()
    .references(() => stockists.id, { onDelete: "cascade" }),
  segment: productSegmentEnum("segment").notNull(),
  type: stockMovementTypeEnum("type").notNull(),
  qty: integer("qty").notNull(),
  note: text("note"),
  /** Required for outward_retail — which Field Salesman ISR took the stock. */
  repUserId: uuid("rep_user_id").references(() => users.id, { onDelete: "set null" }),
  /** Required for outward_wholesale — which wholesale counter it went to. */
  wholesaleCounterId: uuid("wholesale_counter_id").references(() => counters.id, {
    onDelete: "set null",
  }),
  /** Who logged it (the "Logged by" column). */
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily closing balance per depot — written on every movement, then frozen
// when the depot closes the day ("no further edits today"). Kept for trend
// analysis, so this one IS a history table (unlike rep_locations).
export const stockistStockDays = pgTable(
  "stockist_stock_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockistId: uuid("stockist_id")
      .notNull()
      .references(() => stockists.id, { onDelete: "cascade" }),
    stockDate: date("stock_date").notNull(), // IST calendar day
    /** Per-SKU closing balance, e.g. { DG10: 420, DG20: 214, ... }. */
    closing: jsonb("closing").$type<Partial<Record<ProductSegment, number>>>().notNull().default({}),
    total: integer("total").notNull().default(0),
    closed: boolean("closed").notNull().default(false),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stockist_stock_days_date_unique").on(t.stockistId, t.stockDate)],
);

export type DepotStockDay = typeof stockistStockDays.$inferSelect;
export type StockMovementType = (typeof stockMovementTypeEnum.enumValues)[number];

export const schemeClaimStatusEnum = pgEnum("scheme_claim_status", [
  "paid",
  "processing",
  "rejected",
]);

// A retailer (counter) scheme payout, paid via UPI. Belongs to a depot.
export const schemeClaims = pgTable("scheme_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  counterId: uuid("counter_id")
    .notNull()
    .references(() => counters.id, { onDelete: "cascade" }),
  stockistId: uuid("stockist_id")
    .notNull()
    .references(() => stockists.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 40 }).notNull(),
  value: integer("value").notNull(), // rupees
  status: schemeClaimStatusEnum("status").notNull().default("processing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Rate limiting ───────────────────────────────────────────────────────
// Fixed-window counters for the two publicly reachable entry points (login and
// "Request Access"). Postgres-backed rather than in-memory because Next runs
// across instances, where a per-process Map would let an attacker simply spread
// attempts around. One row per (key, window); old rows are pruned opportunistically.
export const rateLimits = pgTable(
  "rate_limits",
  {
    // Bucket identity, e.g. "login:ip:1.2.3.4" or "login:phone:9000000001".
    key: text("key").notNull(),
    // Start of the fixed window this row counts; part of the PK so a new window
    // is a new row and expiry needs no background job.
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export type DepotStock = typeof stockistStock.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type SchemeClaim = typeof schemeClaims.$inferSelect;

export type State = typeof states.$inferSelect;
export type Cnf = typeof cnfs.$inferSelect;
export type Depot = typeof stockists.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Counter = typeof counters.$inferSelect;
export type NewCounter = typeof counters.$inferInsert;
export type DayLog = typeof dayLogs.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type BeatAssignment = typeof beatAssignments.$inferSelect;
