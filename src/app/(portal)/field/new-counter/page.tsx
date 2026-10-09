import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, stockists } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { hasStartedToday } from "@/lib/field/day-log";
import { listProxyPeople } from "@/lib/field/proxy-entry";
import { istDateString } from "@/lib/date";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { StartDayRequired } from "../_components/start-day-required";
import { NewCounterWizard } from "./wizard";

export default async function NewCounterPage({
  searchParams,
}: {
  /** `?from=khq` — opened from Kanpur HQ Reports’ "Add counter" button. */
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("New Counter")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }

  const isAdmin = user.accessRoles.includes("admin");

  /*
   * Everything a rep's version of this page needs, in one round trip: whether
   * their day has started, and their depot's C&F and areas. All three follow
   * from the user alone, but the day-log check used to gate the other two, so
   * the page waited three times over (the C&F was a third read after the
   * depot). Admin's branch below keeps no day log and picks from the whole
   * hierarchy, so it reads none of this.
   */
  let startedToday = true;
  let depotCnfName: string | null = null;
  let depotAreas: { id: string; name: string }[] = [];
  if (!isAdmin) {
    const [started, details] = await Promise.all([
      hasStartedToday(user.id),
      user.depot
        ? Promise.all([
            // The C&F name comes back joined to the depot rather than in a
            // read of its own.
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
          ])
        : Promise.resolve(null),
    ]);
    startedToday = started;
    if (details) {
      depotCnfName = details[0][0]?.cnfName ?? null;
      depotAreas = details[1];
    }
  }

  // A rep works inside a started day; admin keeps no day log and is exempt.
  if (!startedToday) {
    const t = await getT();
    return <StartDayRequired title={t("New Counter")} />;
  }

  // Admin sees the whole hierarchy and can pick any C&F → depot → area.
  if (isAdmin) {
    const [allCnfs, allStockists, allAreas, people, { from }] = await Promise.all([
      db.select().from(cnfs).orderBy(asc(cnfs.name)),
      db.select().from(stockists).orderBy(asc(stockists.name)),
      db.select().from(areas).orderBy(asc(areas.name)),
      // Who a counter can be credited to: reps, and the SOs who add wholesale ones.
      listProxyPeople(["field", "supervisor"]),
      searchParams,
    ]);

    return (
      <NewCounterWizard
        mode="open"
        admin={{
          people,
          self: { id: user.id, name: user.name },
          today: istDateString(),
          fromKhq: from === "khq",
        }}
        cnfs={allCnfs.map((c) => ({ id: c.id, name: c.name }))}
        stockists={allStockists.map((d) => ({
          id: d.id,
          name: d.name,
          cnfId: d.cnfId,
          areas: allAreas.filter((a) => a.stockistId === d.id).map((a) => ({ id: a.id, name: a.name })),
        }))}
      />
    );
  }

  // A field rep belongs to exactly one depot — depot and C&F auto-fill and lock.
  if (!user.depot) {
    const t = await getT();
    return (
      <Notice title={t("New Counter")}>
        {t("You aren't assigned to a stockist yet — ask your Sales Officer to map you to one.")}
      </Notice>
    );
  }



  return (
    <NewCounterWizard
      mode="locked"
      depot={{ id: user.depot.id, name: user.depot.name }}
      cnf={{ name: depotCnfName ?? "—" }}
      areas={depotAreas.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
