import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, stockists } from "@/db/schema";
import type { getCurrentUser } from "@/lib/auth/dal";
import type { NewCounterInput } from "@/lib/field/actions";
import { ALL_COUNTER_TYPES } from "@/lib/field/counter-types";
import { hasStartedToday } from "@/lib/field/day-log";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * What the app's New Counter wizard needs — the ISR ("locked") branch of the
 * website's `/field/new-counter` page: stockist and C&F fixed to the ISR's
 * own, the stockist's areas to pick from, and the types the field may add.
 *
 * The page's Central Admin branch (pick any C&F/stockist, credit someone else,
 * back-date) stays on the website.
 */
export async function getNewCounterForm(user: CurrentUser) {
  const isAdmin = user.accessRoles.includes("admin");

  if (!user.depot) {
    return {
      ok: false as const,
      message: isAdmin
        ? "Central Admin adds counters from the website."
        : "You aren't assigned to a stockist yet — ask your Sales Officer to map you to one.",
    };
  }

  const [started, [cnf], depotAreas] = await Promise.all([
    isAdmin ? Promise.resolve(true) : hasStartedToday(user.id),
    db
      .select({ cnfName: cnfs.name })
      .from(stockists)
      .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
      .where(eq(stockists.id, user.depot.id))
      .limit(1),
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(eq(areas.stockistId, user.depot.id))
      .orderBy(asc(areas.name)),
  ]);

  if (!started) {
    return { ok: false as const, startDayFirst: true, message: "Start your day log before adding counters or visits." };
  }

  return {
    ok: true as const,
    depot: { id: user.depot.id, name: user.depot.name },
    cnfName: cnf?.cnfName ?? "—",
    areas: depotAreas,
    // Wholesale counters are added by the Sales Officer, never from the field.
    counterTypes: ALL_COUNTER_TYPES.filter((t) => t !== "Wholesale"),
  };
}

/** A new counter from a request body, coerced to strings; every rule is left
 * to `createCounter`. */
export function newCounterInputFromBody(body: unknown): NewCounterInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    name: str(b.name),
    phone: str(b.phone).trim(),
    address: str(b.address),
    stockistId: str(b.stockistId),
    areaId: str(b.areaId),
    type: str(b.type) as NewCounterInput["type"],
    typeOther: str(b.typeOther),
    gps: str(b.gps),
  };
}
