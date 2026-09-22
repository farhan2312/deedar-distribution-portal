"use client";

import { useActionState, useState } from "react";
import type { AccessRole } from "@/db/schema";
import { addUser, type AddUserResult } from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { pillStyle, type DepotGroup } from "./controls";

export type AreaOpt = { id: string; name: string; stockistId: string };

type Options = {
  /** The roles offered, with the same short labels as the table's columns. */
  roles: { role: AccessRole; label: string }[];
  groups: DepotGroup[];
  areas: AreaOpt[];
  /** Active SOs, each with the stockists they supervise. */
  supervisors: { id: string; name: string; stockistIds: string[] }[];
  cnfOptions: { id: string; name: string }[];
};

/**
 * Add a user, and map them in the same step.
 *
 * The mapping inputs follow the table's rules exactly — which roles need a
 * stockist, which areas a stockist may offer, one C&F per Sales Officer — but
 * nothing is written until Add user is pressed. The table's controls save on
 * every click because they edit an account that already exists; here there is
 * no account until the end, so the whole form goes to the server at once and
 * is written in one transaction.
 *
 * Every mapping field is optional. Someone whose areas are not settled yet can
 * be added now and mapped later from the table, as before.
 */
export function AddUserForm(props: Options) {
  const t = useT();
  const [state, formAction, pending] = useActionState<AddUserResult | null, FormData>(
    async (_prev, fd) => addUser(fd),
    null,
  );
  // Bumped only on success, so the fields clear after an add but survive a
  // failure — an admin who typed a taken mobile keeps the roles and areas they
  // already picked instead of starting over.
  const [resetKey, setResetKey] = useState(0);
  const [seen, setSeen] = useState<AddUserResult | null>(null);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setResetKey((k) => k + 1);
  }

  return (
    <form action={formAction}>
      <Fields key={resetKey} {...props} />

      <button className="btn btn-primary mt-4" type="submit" disabled={pending}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        {pending ? t("Adding…") : t("Add user")}
      </button>

      {state ? (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          role="status"
          style={
            state.ok
              ? { background: "rgba(30,158,90,.08)", color: "#1E9E5A", border: "1px solid rgba(30,158,90,.25)" }
              : { background: "rgba(199,38,59,.06)", color: "var(--danger)", border: "1px solid rgba(199,38,59,.22)" }
          }
        >
          {state.ok ? (
            <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          )}
          <span className="text-[12.5px] font-medium">{state.message}</span>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "var(--bg-soft)" }}>
          <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
          <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {t("Password is the mobile number until first login.")}
          </p>
        </div>
      )}
    </form>
  );
}

/** Everything that resets after a successful add. */
function Fields({ roles: roleOpts, groups, areas, supervisors, cnfOptions }: Options) {
  const t = useT();
  // Controlled, so React's automatic reset after a form action cannot wipe them
  // on a FAILED submit — only the success remount above clears the form.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<Set<AccessRole>>(new Set());

  // Field / depot / dealer: one stockist, picked C&F → stockist → sub-dealer.
  const [cnf, setCnf] = useState("");
  const [top, setTop] = useState("");
  const [sub, setSub] = useState("");
  const [areaIds, setAreaIds] = useState<Set<string>>(new Set());
  const [reportsTo, setReportsTo] = useState("");

  // Sales Officer: several stockists, all under one C&F.
  const [soCnf, setSoCnf] = useState("");
  const [soStockists, setSoStockists] = useState<Set<string>>(new Set());

  // C&F HQ.
  const [hqCnf, setHqCnf] = useState("");

  const ticked = (r: AccessRole) => roles.has(r);
  // An admin has full access and needs no mapping — the table hides it for
  // admins, and the server drops it — so under Admin no mapping field shows.
  const isAdmin = roles.has("admin");
  const has = (r: AccessRole) => !isAdmin && roles.has(r);
  const needsStockist = has("field") || has("depot") || has("dealer");

  const inCnf = groups.find((g) => g.cnfId === cnf)?.stockists ?? [];
  // Sub-dealers are reached through their dealer, never listed beside it.
  const topLevel = inCnf.filter((d) => d.parentId === null);
  const parent = topLevel.find((d) => d.id === top) ?? null;
  const subDealers = parent?.kind === "dealer" ? inCnf.filter((d) => d.parentId === parent.id) : [];
  const stockistId = sub || top;

  // The areas this stockist can offer: its own, plus its sub-dealers' when it
  // is a dealer — the same family the table shows and the server checks.
  const chosen = inCnf.find((d) => d.id === stockistId) ?? null;
  const family = chosen ? [chosen, ...inCnf.filter((d) => d.parentId === chosen.id)] : [];
  const areaGroups = family
    .map((s) => ({ id: s.id, name: s.name, areas: areas.filter((a) => a.stockistId === s.id) }))
    .filter((g) => g.areas.length > 0);

  const soGroup = groups.find((g) => g.cnfId === soCnf);

  // Only the SOs who supervise the chosen stockist: an SO can assign beats to
  // a rep only when they hold that rep's stockist, so anyone else in this list
  // would be a manager who cannot manage them.
  const soForStockist = stockistId
    ? supervisors.filter((s) => s.stockistIds.includes(stockistId))
    : [];

  function toggleRole(r: AccessRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  // Changing the stockist in any way invalidates the areas ticked for the old
  // one — the same wipe `setUserDepot` does on the server.
  function pickStockist(nextCnf: string, nextTop: string, nextSub: string) {
    setCnf(nextCnf);
    setTop(nextTop);
    setSub(nextSub);
    setAreaIds(new Set());
    // The SO picked for the old stockist may not cover the new one.
    setReportsTo("");
  }

  function toggleIn(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const small = { padding: "6px 9px", fontSize: 12.5 } as const;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="field">
          <label>{t("Name")}</label>
          <input
            className="inp"
            type="text"
            name="name"
            placeholder={t("Full name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>{t("Mobile")}</label>
          <input
            className="inp"
            type="tel"
            name="phone"
            placeholder={t("10-digit mobile")}
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
      </div>

      {/* ── Roles ─────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>
          {t("Access")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roleOpts.map((r) => (
            <label
              key={r.role}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={pillStyle(ticked(r.role))}
            >
              <input
                type="checkbox"
                name="role"
                value={r.role}
                checked={ticked(r.role)}
                onChange={() => toggleRole(r.role)}
                style={{ accentColor: "var(--accent)" }}
              />
              {t(r.label)}
            </label>
          ))}
        </div>
      </div>

      {/* ── Mapping, only for the roles ticked above ────────────────────── */}
      {roles.size > 0 && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border p-3.5" style={{ borderColor: "var(--hairline)" }}>
          {isAdmin && (
            <Section label={t("Admin")}>
              <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                {t("Full access — every section. No stockist / C&F / area needed.")}
              </p>
            </Section>
          )}

          {needsStockist && (
            <Section label={has("field") ? t("Stockist (Field ISR)") : t("Stockist (Depot / Dealer)")}>
              <input type="hidden" name="stockistId" value={stockistId} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select className="inp" style={small} value={cnf} onChange={(e) => pickStockist(e.target.value, "", "")}>
                  <option value="">{t("Select C&F")}</option>
                  {groups.map((g) => (
                    <option key={g.cnfId} value={g.cnfId}>{g.cnfName}</option>
                  ))}
                </select>
                <select
                  className="inp"
                  style={small}
                  value={top}
                  disabled={!cnf}
                  onChange={(e) => pickStockist(cnf, e.target.value, "")}
                >
                  <option value="">{cnf ? t("Select stockist") : t("Pick a C&F first")}</option>
                  {topLevel.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.kind === "dealer" ? ` (${t("Dealer")})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {subDealers.length > 0 && (
                <select
                  className="inp mt-2"
                  style={small}
                  value={sub}
                  onChange={(e) => pickStockist(cnf, top, e.target.value)}
                >
                  {/* Blank means the dealer itself, not "nothing chosen". */}
                  <option value="">{t("— the dealer itself")}</option>
                  {subDealers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
            </Section>
          )}

          {has("field") && stockistId && (
            <Section label={t("Areas")}>
              {areaGroups.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {t("This stockist has no areas yet.")}
                </p>
              ) : (
                areaGroups.map((g) => {
                  const on = g.areas.filter((a) => areaIds.has(a.id)).length;
                  const allOn = on === g.areas.length;
                  return (
                    <div key={g.id} className="mb-1.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                          {areaGroups.length > 1 ? g.name : ""}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[10.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                            {on}/{g.areas.length}
                          </span>
                          <button
                            type="button"
                            className="link text-[10.5px]"
                            onClick={() =>
                              setAreaIds((prev) => {
                                const next = new Set(prev);
                                for (const a of g.areas) {
                                  if (allOn) next.delete(a.id);
                                  else next.add(a.id);
                                }
                                return next;
                              })
                            }
                          >
                            {allOn ? t("Clear all") : t("Select all")}
                          </button>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.areas.map((a) => (
                          <label
                            key={a.id}
                            className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
                            style={pillStyle(areaIds.has(a.id))}
                          >
                            <input
                              type="checkbox"
                              name="areaId"
                              value={a.id}
                              checked={areaIds.has(a.id)}
                              onChange={() => setAreaIds((prev) => toggleIn(prev, a.id))}
                              style={{ accentColor: "var(--accent)" }}
                            />
                            {a.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </Section>
          )}

          {has("field") && (
            <Section label={t("Reports to (SO)")}>
              <select
                className="inp"
                style={small}
                name="reportsToUserId"
                value={reportsTo}
                disabled={soForStockist.length === 0}
                onChange={(e) => setReportsTo(e.target.value)}
              >
                <option value="">
                  {!stockistId
                    ? t("Pick a stockist first")
                    : soForStockist.length === 0
                      ? t("No Sales Officer supervises this stockist yet")
                      : t("Select supervisor")}
                </option>
                {soForStockist.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Section>
          )}

          {has("supervisor") && (
            <Section label={t("Stockists (Sales Officer)")}>
              <select
                className="inp"
                style={small}
                value={soCnf}
                onChange={(e) => {
                  // One C&F per Sales Officer: switching C&F starts the
                  // selection over rather than mixing two C&Fs' stockists.
                  setSoCnf(e.target.value);
                  setSoStockists(new Set());
                }}
              >
                <option value="">{t("Select C&F")}</option>
                {groups.map((g) => (
                  <option key={g.cnfId} value={g.cnfId}>{g.cnfName}</option>
                ))}
              </select>
              {soGroup && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {soGroup.stockists.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
                      style={pillStyle(soStockists.has(d.id))}
                    >
                      <input
                        type="checkbox"
                        name="supervisedStockistId"
                        value={d.id}
                        checked={soStockists.has(d.id)}
                        onChange={() => setSoStockists((prev) => toggleIn(prev, d.id))}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      {/* A sub-dealer is labelled under its dealer, so a flat
                          list still says where each one sits. */}
                      {d.parentId
                        ? `${soGroup.stockists.find((x) => x.id === d.parentId)?.name ?? ""} › ${d.name}`
                        : d.name}
                    </label>
                  ))}
                </div>
              )}
            </Section>
          )}

          {has("hq") && (
            <Section label={t("C&F HQ")}>
              <select
                className="inp"
                style={small}
                name="cnfId"
                value={hqCnf}
                onChange={(e) => setHqCnf(e.target.value)}
              >
                <option value="">{t("Select C&F HQ")}</option>
                {cnfOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Section>
          )}

          {has("khq") && (
            <Section label={t("Kanpur HQ")}>
              <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>{t("Company-wide")}</p>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>{label}</div>
      {children}
    </div>
  );
}
