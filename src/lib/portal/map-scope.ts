import "server-only";
import { and, asc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AccessRole } from "@/db/schema";
import { areas, cnfs, counters, stockists, visits } from "@/db/schema";
import { getT } from "@/lib/i18n/server";

export type ScopeOption = { id: string; name: string };

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

  // ── C&F level ──────────────────────────────────────────────────────────
  let cnfOptions: ScopeOption[] = [];
  let cnf: ScopeOption | null = null;
  if (hasCnfLevel) {
    cnfOptions = await db.select({ id: cnfs.id, name: cnfs.name }).from(cnfs).orderBy(asc(cnfs.name));
    cnf = pick(cnfOptions, params.cnf);
  } else if (section === "hq") {
    cnf = user.cnf;
  }

  // ── Depot level ────────────────────────────────────────────────────────
  // Admin and HQ read stockists from the C&F; an SO is limited to their own.
  let depotOptions: ScopeOption[] = [];
  if (hasDepotLevel) {
    if (section === "supervisor" && !isAdmin) {
      depotOptions = supervisorDepots(user);
    } else if (cnf) {
      depotOptions = await db
        .select({ id: stockists.id, name: stockists.name })
        .from(stockists)
        .where(eq(stockists.cnfId, cnf.id))
        .orderBy(asc(stockists.name));
    } else if (isAdmin) {
      depotOptions = await db
        .select({ id: stockists.id, name: stockists.name })
        .from(stockists)
        .orderBy(asc(stockists.name));
    }
  }
  const depot = pick(depotOptions, params.depot);
  const scopedStockistIds = depot ? [depot.id] : depotOptions.map((d) => d.id);

  // ── Area level ─────────────────────────────────────────────────────────
  // An ISR picks from their own areas. Everyone else picks from the selected
  // depot's areas — or, with no depot chosen, every area in the depot scope,
  // so the Area filter is usable without drilling in first.
  let areaOptions: ScopeOption[] = [];
  if (section === "field" && !isAdmin) {
    areaOptions = [...user.areas].sort((a, b) => a.name.localeCompare(b.name));
  } else if (scopedStockistIds.length) {
    areaOptions = await db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(inArray(areas.stockistId, scopedStockistIds))
      .orderBy(asc(areas.name));
  }
  const area = pick(areaOptions, params.area);

  // ── Derive the counter predicate, narrowest level first ────────────────
  let stockistIds: string[] | null;
  let where: SQL | undefined;

  if (area) {
    where = eq(counters.areaId, area.id);
    stockistIds = scopedStockistIds.length ? scopedStockistIds : null;
  } else if (depot) {
    where = eq(counters.stockistId, depot.id);
    stockistIds = [depot.id];
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
export async function getCountersVisitedTodayIn(
  counterIds: string[],
  bounds: { start: Date; end: Date },
): Promise<Set<string>> {
  if (counterIds.length === 0) return new Set();
  const rows = await db
    .select({ counterId: visits.counterId })
    .from(visits)
    .where(
      and(
        inArray(visits.counterId, counterIds),
        gte(visits.visitedAt, bounds.start),
        lt(visits.visitedAt, bounds.end),
      ),
    );
  return new Set(rows.map((r) => r.counterId));
}
