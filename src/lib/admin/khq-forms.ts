"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, stockists } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { listProxyPeople } from "@/lib/field/proxy-entry";
import { getVisitForEdit } from "@/lib/field/visit-actions";
import { istDateString } from "@/lib/date";
import type { AdminWizardExtras, CnfOption, StockistOption } from "@/app/(portal)/field/new-counter/wizard";
import type { CreditContext } from "@/app/(portal)/field/_components/credit-fields";
import type { EditCounterInput } from "@/lib/field/actions";
import type { CompetitorPresence, VisitItem } from "@/db/schema";

/**
 * What each Kanpur HQ pop-up form needs, fetched when the pop-up opens.
 *
 * Central Admin adds and corrects counters and visits from Reports and the
 * counter page without leaving them. The pages could load all of this up
 * front, but every visit to Reports would then pay for a stockist tree and a
 * people list that is wanted on a handful of them — so each form asks for its
 * own data at the moment it is opened instead.
 *
 * Every loader is Central Admin only and answers null otherwise; the forms'
 * own server actions re-check everything they are sent regardless.
 */

async function currentAdmin() {
  const user = await getCurrentUser();
  return user?.accessRoles.includes("admin") ? user : null;
}

export type NewCounterFormData = {
  cnfs: CnfOption[];
  stockists: StockistOption[];
  admin: AdminWizardExtras;
};

export async function loadNewCounterForm(): Promise<NewCounterFormData | null> {
  const user = await currentAdmin();
  if (!user) return null;
  const [cnfRows, stockistRows, areaRows, people] = await Promise.all([
    db.select({ id: cnfs.id, name: cnfs.name }).from(cnfs).orderBy(asc(cnfs.name)),
    db
      .select({ id: stockists.id, name: stockists.name, cnfId: stockists.cnfId })
      .from(stockists)
      .orderBy(asc(stockists.name)),
    db
      .select({ id: areas.id, name: areas.name, stockistId: areas.stockistId })
      .from(areas)
      .orderBy(asc(areas.name)),
    // Reps, and the SOs who add wholesale counters.
    listProxyPeople(["field", "supervisor"]),
  ]);
  return {
    cnfs: cnfRows,
    stockists: stockistRows.map((d) => ({
      ...d,
      areas: areaRows.filter((a) => a.stockistId === d.id).map((a) => ({ id: a.id, name: a.name })),
    })),
    admin: {
      people,
      self: { id: user.id, name: user.name },
      today: istDateString(),
      fromKhq: true,
    },
  };
}

/** The counter a visit form is about — its header. */
export type FormCounter = { id: string; name: string; area: string };

async function formCounter(counterId: string) {
  const [c] = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      typeOther: counters.typeOther,
      areaName: areas.name,
      stockistId: counters.stockistId,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(eq(counters.id, counterId))
    .limit(1);
  return c ?? null;
}

export type NewVisitFormData = {
  counter: FormCounter;
  admin: CreditContext & { stockistId: string };
};

export async function loadNewVisitForm(counterId: string): Promise<NewVisitFormData | null> {
  const user = await currentAdmin();
  if (!user) return null;
  const [c, people] = await Promise.all([formCounter(counterId), listProxyPeople(["field"])]);
  if (!c) return null;
  return {
    counter: { id: c.id, name: c.name, area: `${counterTypeLabel(c.type, c.typeOther)} · ${c.areaName}` },
    admin: {
      people,
      self: { id: user.id, name: user.name },
      today: istDateString(),
      stockistId: c.stockistId,
    },
  };
}

export type EditVisitFormData = {
  counter: FormCounter;
  initial: {
    items: VisitItem[];
    rank: number | null;
    competitor: CompetitorPresence | null;
    competitorBrand: string;
    remarks: string;
  };
};

export async function loadEditVisitForm(
  counterId: string,
  visitId: string,
): Promise<EditVisitFormData | null> {
  const user = await currentAdmin();
  if (!user) return null;
  const [c, visit] = await Promise.all([formCounter(counterId), getVisitForEdit(visitId)]);
  if (!c || !visit || visit.counterId !== counterId) return null;
  return {
    counter: { id: c.id, name: c.name, area: `${counterTypeLabel(c.type, c.typeOther)} · ${c.areaName}` },
    initial: {
      items: visit.items,
      rank: visit.rank,
      competitor: visit.competitor,
      competitorBrand: visit.competitorBrand,
      remarks: visit.remarks,
    },
  };
}

export type EditCounterFormData = {
  counterId: string;
  counterName: string;
  areaOptions: { id: string; name: string }[];
  initial: {
    name: string;
    address: string;
    type: EditCounterInput["type"];
    typeOther: string;
    areaId: string;
    gps: string;
  };
};

export async function loadEditCounterForm(counterId: string): Promise<EditCounterFormData | null> {
  const user = await currentAdmin();
  if (!user) return null;
  // The counter and its stockist's areas together: the areas reach the
  // stockist through a subquery rather than waiting for the counter row.
  const [[counter], areaOptions] = await Promise.all([
    db
      .select({
        id: counters.id,
        name: counters.name,
        address: counters.address,
        type: counters.type,
        typeOther: counters.typeOther,
        areaId: counters.areaId,
        lat: counters.lat,
        lng: counters.lng,
      })
      .from(counters)
      .where(eq(counters.id, counterId))
      .limit(1),
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(
        inArray(
          areas.stockistId,
          db.select({ id: counters.stockistId }).from(counters).where(eq(counters.id, counterId)),
        ),
      )
      .orderBy(asc(areas.name)),
  ]);
  if (!counter) return null;
  return {
    counterId: counter.id,
    counterName: counter.name,
    areaOptions,
    initial: {
      name: counter.name,
      address: counter.address ?? "",
      type: counter.type,
      typeOther: counter.typeOther ?? "",
      areaId: counter.areaId,
      gps: counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : "",
    },
  };
}
