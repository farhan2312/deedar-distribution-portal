"use client";

import { useT } from "@/lib/i18n/provider";

/** Someone a counter or visit can be credited to. Mirrors `ProxyPerson` in
 * lib/field/proxy-entry.ts, which is server-only and so can't be imported. */
export type PersonOption = {
  id: string;
  name: string;
  /** Every stockist this person works in: an ISR's own, plus each stockist a
   * Sales Officer supervises. */
  stockistIds: string[];
  isSupervisor: boolean;
};

/** What the admin forms need to offer crediting: who can be picked, the admin
 * themself, and today's IST date as the default and the upper bound. */
export type CreditContext = {
  people: PersonOption[];
  self: { id: string; name: string };
  today: string;
};

/**
 * "Who, and which day" for an entry Central Admin makes on someone's behalf —
 * Added by / Added on for a counter, Visited by / Visited on for a visit.
 *
 * The people offered are the stockist's own: its ISRs, then the Sales Officers
 * who supervise it. A rep works in their own depot and nowhere else, so a name
 * from another stockist could only ever be a mis-pick — and the whole company's
 * list made the right one hard to find. With no stockist chosen yet there is no
 * one to offer, so the list waits for it. A day and not a time: whoever phones
 * in yesterday's work knows the day, rarely the minute.
 */
export function CreditFields({
  personLabel,
  dateLabel,
  context,
  stockistId,
  personId,
  date,
  onPerson,
  onDate,
}: {
  personLabel: string;
  dateLabel: string;
  context: CreditContext;
  /** The stockist the entry belongs to; null until one is picked. */
  stockistId: string | null;
  personId: string;
  date: string;
  onPerson: (id: string) => void;
  onDate: (date: string) => void;
}) {
  const t = useT();
  const inStockist = stockistId
    ? context.people.filter((p) => p.id !== context.self.id && p.stockistIds.includes(stockistId))
    : [];
  // Reps first — they're who an entry is almost always for — then the SOs.
  const reps = inStockist.filter((p) => !p.isSupervisor);
  const sos = inStockist.filter((p) => p.isSupervisor);

  return (
    <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--bg-soft)" }}>
      <div className="mb-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
        {t("Entering this for someone else? Credit them, and the day it happened.")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label>{personLabel}</label>
          <select
            className="inp"
            value={personId}
            disabled={!stockistId}
            onChange={(e) => onPerson(e.target.value)}
          >
            <option value="">{stockistId ? t("Select a person") : t("Pick a stockist first")}</option>
            {stockistId && (
              <option value={context.self.id}>
                {context.self.name} ({t("Myself")})
              </option>
            )}
            {reps.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {sos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({t("SO")})
              </option>
            ))}
          </select>
          {stockistId && inStockist.length === 0 && (
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--warning)" }}>
              {t("No one is mapped to this stockist yet — map them in Users & Access.")}
            </p>
          )}
        </div>
        <div className="field">
          <label>{dateLabel}</label>
          <input
            className="inp"
            type="date"
            value={date}
            max={context.today}
            onChange={(e) => onDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
