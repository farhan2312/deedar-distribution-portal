import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AccessRole } from "@/db/schema";
import { beatAssignments, cnfs, counters, stockists, visits } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { areaRowsWhere, groupAreaOptions } from "./area-options";

export type ScopeOption = {
  id: string;
  name: string;
  /** Optgroup heading. Set when one dropdown mixes options from more than one
   * owner — a dealer's areas alongside its sub-dealers' — so the list still
   * says who owns what. Absent means "no heading", the common case. */
  group?: string;
};

/** Which map is being viewed — decides the non-admin fallback scoping. */
export type MapSection = "field" | "supervisor" | "hq";

/** The slice of the session user the cascade needs. */
export type MapScopeUser = {
  accessRoles: AccessRole[];
  cnf: ScopeOption | null;
  depot: ScopeOption | null;
  supervisedStockists: ScopeOption[];
  areas: ScopeOption[];
};

export type MapScopeParams = { cnf?: string; depot?: string; area?: string };

/** One rendered dropdown. Present in `levels` = the viewer may filter here. */
export type ScopeLevel = {
  key: "cnf" | "depot" | "area";
  /** Accessible name for the select. */
  label: string;
  /** Wording of the unfiltered option. */
  allLabel: string;
  options: ScopeOption[];
  /** Selected id, or "all". */
  value: string;
};

/**
 * A resolved C&F → Depot → Area cascade for one of the three live maps.
 *
 * Which levels a viewer gets depends on their role, not on the page or on how
 * much data happens to exist:
 *   • Central Admin — all three, on every map. Nothing chosen means everything.
 *   • C&F HQ        — Depot → Area, pinned to their own C&F.
 *   • Sales Officer — Depot (their assigned stockists) → Area.
 *   • Field ISR     — Area only, within their assigned areas.
 *
 * A level is offered even when it currently has one option or none — the set
 * of filters a role sees shouldn't shift as the org chart grows. Levels with
 * no options render disabled.
 */
export type MapScope = {
  /**
   * Everything `<MapScopePickers/>` needs, and nothing else. Kept as its own
   * plain array because the picker is a Client Component: spreading the whole
   * scope across that boundary hands React the Drizzle `where` below, whose
   * column references are circular, and serialization dies with a call-stack
   * overflow. Pass `scope.levels`, never `scope`.
   */
  levels: ScopeLevel[];
  cnf: ScopeOption | null;
  depot: ScopeOption | null;
  area: ScopeOption | null;
  /**
   * Depots the view is limited to, or `null` for unrestricted (admin with no
   * C&F or depot chosen). Used to scope the rep roster on the SO/HQ maps —
   * note the Area level deliberately does NOT narrow reps, only counters,
   * since a rep belongs to a depot rather than to one area.
   */
  stockistIds: string[] | null;
  /** Predicate on `counters` for the chosen scope; `undefined` = everything. */
  where: SQL | undefined;
  /** Heading label — the narrowest chosen level. */
  label: string;
};

/** Fallback heading when the viewer hasn't narrowed anything down. */
const FALLBACK_LABEL: Record<MapSection, string> = {
  field: "All Areas",
  supervisor: "All Depots",
  hq: "All C&F",
};

/** An id-shaped param, or null — anything else would be a SQL type error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function asId(v: string | undefined): string | null {
  return v && UUID.test(v) ? v : null;
}

/** A picked id, or null for "all" / a stale id that isn't on offer. */
function pick(options: ScopeOption[], requested: string | undefined): ScopeOption | null {
  if (!requested || requested === "all") return null;
  return options.find((o) => o.id === requested) ?? null;
}

/** Depots a Sales Officer may look at — their own plus supervised, deduped. */
function supervisorDepots(user: MapScopeUser): ScopeOption[] {
  const byId = new Map<string, ScopeOption>();
  for (const d of user.supervisedStockists) byId.set(d.id, d);
  if (user.depot) byId.set(user.depot.id, user.depot);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the cascade from the URL params for this viewer and map.
 *
 * Out-of-range ids fall back to the level above rather than erroring, so a
 * stale query string (a depot from another C&F, an area from another depot)
 * simply widens the view instead of breaking it.
 */
export async function resolveMapScope(
  user: MapScopeUser,
  section: MapSection,
  params: MapScopeParams,
): Promise<MapScope> {
  const t = await getT();
  const isAdmin = user.accessRoles.includes("admin");
  // Only admins choose a C&F; HQ is pinned to their own; SO/ISR are below it.
  const hasCnfLevel = isAdmin;
  // An ISR is scoped by area within their one depot, so no depot filter.
  const hasDepotLevel = isAdmin || section !== "field";

  // ── Every level's options, in one round trip ───────────────────────────
  //
  // The levels used to be read one after another — the C&F list, then the
  // stockists under whichever C&F was picked, then their sub-dealers, then
  // those stockists' areas — four waits on a database ~75 ms away before the
  // page had asked for anything of its own. Each query below instead covers
  // the widest scope this viewer could pick at that level, and the picking
  // happens in memory. Ordering stays in SQL (see `areaRowsWhere`), and
  // filtering preserves order, so every dropdown reads exactly as before.
  const soDepots = section === "supervisor" && !isAdmin ? supervisorDepots(user) : null;
  const cnfGuess = asId(params.cnf);

  /** Every stockist this viewer can reach, sub-dealers included. */
  let pool: SQL | undefined;
  let needsPool = true;
  if (soDepots) {
    const ids = soDepots.map((d) => d.id);
    // Their own stockists, and the sub-dealers hanging off them.
    pool = ids.length
      ? or(inArray(stockists.id, ids), inArray(stockists.parentId, ids))
      : sql`false`;
  } else if (section === "hq" && !isAdmin) {
    pool = user.cnf ? eq(stockists.cnfId, user.cnf.id) : sql`false`;
  } else if (isAdmin) {
    // The C&F named in the URL, or everything. A name that no longer resolves
    // is caught below.
    pool = cnfGuess ? eq(stockists.cnfId, cnfGuess) : undefined;
  } else {
    // A field ISR's areas come from their own mapping — no pools to read.
    needsPool = false;
  }

  const stockistCols = {
    id: stockists.id,
    name: stockists.name,
    cnfId: stockists.cnfId,
    parentId: stockists.parentId,
  };
  const none = Promise.resolve([] as never[]);
  const [cnfOptions, pooledStockists, pooledAreas] = await Promise.all([
    hasCnfLevel
      ? db.select({ id: cnfs.id, name: cnfs.name }).from(cnfs).orderBy(asc(cnfs.name))
      : none,
    needsPool ? db.select(stockistCols).from(stockists).where(pool).orderBy(asc(stockists.name)) : none,
    needsPool ? areaRowsWhere(pool) : none,
  ]);
  let stockistRows = pooledStockists;
  let areaRows = pooledAreas;

  // ── C&F level ──────────────────────────────────────────────────────────
  let cnf: ScopeOption | null = null;
  if (hasCnfLevel) cnf = pick(cnfOptions, params.cnf);
  else if (section === "hq") cnf = user.cnf;

  // An admin whose URL names a C&F that is gone: the pools were read for it,
  // so read them again for everything. A stale link, not a normal load.
  if (isAdmin && cnfGuess && !cnf) {
    [stockistRows, areaRows] = await Promise.all([
      db.select(stockistCols).from(stockists).orderBy(asc(stockists.name)),
      areaRowsWhere(undefined),
    ]);
  }

  // ── Depot level ────────────────────────────────────────────────────────
  // Admin and HQ read stockists from the C&F; an SO is limited to their own.
  let depotOptions: ScopeOption[] = [];
  if (hasDepotLevel) {
    if (soDepots) {
      depotOptions = soDepots;
    } else if (cnf) {
      const cnfId = cnf.id;
      depotOptions = stockistRows.filter((s) => s.cnfId === cnfId).map((s) => ({ id: s.id, name: s.name }));
    } else if (isAdmin) {
      depotOptions = stockistRows.map((s) => ({ id: s.id, name: s.name }));
    }
  }
  const depot = pick(depotOptions, params.depot);
  // Choosing a dealer means its sub-dealers too: their areas are part of that
  // dealer's territory, and the Area dropdown lists them, so the counters
  // behind them have to be in scope as well.
  const base = depot ? [depot.id] : depotOptions.map((d) => d.id);
  const children = base.length
    ? stockistRows.filter((s) => s.parentId && base.includes(s.parentId)).map((s) => s.id)
    : [];
  const scopedStockistIds = children.length ? [...new Set([...base, ...children])] : base;

  // ── Area level ─────────────────────────────────────────────────────────
  // An ISR picks from their own areas. Everyone else picks from the selected
  // depot's areas — or, with no depot chosen, every area in the depot scope,
  // so the Area filter is usable without drilling in first.
  let areaOptions: ScopeOption[] = [];
  if (section === "field" && !isAdmin) {
    areaOptions = [...user.areas].sort((a, b) => a.name.localeCompare(b.name));
  } else if (scopedStockistIds.length) {
    // Grouped by owner once more than one stockist is in scope — a dealer's
    // own areas first, then a heading per sub-dealer.
    const scoped = new Set(scopedStockistIds);
    areaOptions = groupAreaOptions(areaRows.filter((r) => scoped.has(r.stockistId)));
  }
  const area = pick(areaOptions, params.area);

  // ── Derive the counter predicate, narrowest level first ────────────────
  let stockistIds: string[] | null;
  let where: SQL | undefined;

  if (area) {
    where = eq(counters.areaId, area.id);
    stockistIds = scopedStockistIds.length ? scopedStockistIds : null;
  } else if (depot) {
    // `scopedStockistIds` is the dealer plus its sub-dealers here, so a dealer
    // rolls its sub-dealers up rather than showing as an oddly empty branch.
    where = inArray(counters.stockistId, scopedStockistIds);
    stockistIds = scopedStockistIds;
  } else if (section === "field" && !isAdmin) {
    // An ISR with no area picked sees all of their own areas.
    const ids = areaOptions.map((a) => a.id);
    where = ids.length ? inArray(counters.areaId, ids) : sql`false`;
    stockistIds = user.depot ? [user.depot.id] : null;
  } else if (isAdmin && !cnf) {
    where = undefined; // everything
    stockistIds = null;
  } else if (scopedStockistIds.length) {
    where = inArray(counters.stockistId, scopedStockistIds);
    stockistIds = scopedStockistIds;
  } else {
    // Nothing in scope: a C&F with no stockists, an SO with none assigned, an
    // HQ user not mapped to a C&F. Match nothing rather than falling open.
    where = sql`false`;
    stockistIds = [];
  }

  // With a single option there's nothing to choose, so name it outright
  // instead of calling the viewer's whole world "All Depots"/"All Areas".
  const soleDepot = !depot && depotOptions.length === 1 ? depotOptions[0] : null;
  const soleArea = !area && areaOptions.length === 1 ? areaOptions[0] : null;
  const label =
    area?.name ?? depot?.name ?? soleArea?.name ?? soleDepot?.name ?? cnf?.name ?? t(FALLBACK_LABEL[section]);

  const levels: ScopeLevel[] = [];
  if (hasCnfLevel) {
    levels.push({ key: "cnf", label: t("C&F HQ"), allLabel: t("All C&F"), options: cnfOptions, value: cnf?.id ?? "all" });
  }
  if (hasDepotLevel) {
    levels.push({
      key: "depot",
      label: t("Stockist"),
      allLabel: t("All stockists"),
      options: depotOptions,
      value: depot?.id ?? "all",
    });
  }
  levels.push({ key: "area", label: t("Area"), allLabel: t("All areas"), options: areaOptions, value: area?.id ?? "all" });

  return { levels, cnf, depot, area, stockistIds, where, label };
}

/**
 * Distinct counters (from a known on-screen set) that ANY rep visited within
 * the window. The rep-keyed `getCountersVisitedToday` needs a rep id list; an
 * admin viewing by geography has none, so this works back from the counters.
 */
/**
 * Counter-wide lookups for a map, keyed on the scope predicate rather than on
 * a list of counter ids.
 *
 * Asking by id meant waiting for the counter query first: three stages for one
 * screen. Asking by scope lets them all run together — the same rows, one wait
 * instead of two.
 */

/** Stock recorded at each counter's most recent visit. */
export async function latestStockIn(where: SQL | undefined): Promise<Map<string, number>> {
  const rows = await db
    // One row per counter, newest first — rather than every visit ever made to
    // them, which is what keeping the first of a sorted list required.
    .selectDistinctOn([visits.counterId], { counterId: visits.counterId, stock: visits.stock })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(where)
    .orderBy(visits.counterId, desc(visits.visitedAt), desc(visits.id));
  return new Map(rows.map((r) => [r.counterId, r.stock]));
}

/** Counters on somebody's beat for the given IST day. */
export async function assignedTodayIn(
  where: SQL | undefined,
  logDate: string,
): Promise<Set<string>> {
  const onDate = eq(beatAssignments.beatDate, logDate);
  const rows = await db
    .selectDistinct({ counterId: beatAssignments.counterId })
    .from(beatAssignments)
    .innerJoin(counters, eq(counters.id, beatAssignments.counterId))
    .where(where ? and(onDate, where) : onDate);
  return new Set(rows.map((r) => r.counterId));
}

/** Counters visited by anyone within the window. */
export async function visitedTodayIn(
  where: SQL | undefined,
  bounds: { start: Date; end: Date },
): Promise<Set<string>> {
  const inWindow = and(gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end))!;
  const rows = await db
    .selectDistinct({ counterId: visits.counterId })
    .from(visits)
    .innerJoin(counters, eq(counters.id, visits.counterId))
    .where(where ? and(inWindow, where) : inWindow);
  return new Set(rows.map((r) => r.counterId));
}

