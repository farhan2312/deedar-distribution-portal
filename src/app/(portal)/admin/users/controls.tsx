"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { AccessRole, StockistKind } from "@/db/schema";
import {
  addUser,
  removeUser,
  resetUserPassword,
  setUserActive,
  setUserCnf,
  setUserDepot,
  setUserReportsTo,
  toggleAccessRole,
  setUserAreasForStockist,
  toggleUserArea,
  toggleUserDepot,
  updateUser,
  type AddUserResult,
} from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { ConfirmDelete } from "@/components/ui/confirm-delete";

/**
 * "Add a user" form with inline confirmation. `useActionState` keeps the
 * server action's result (added / duplicate / invalid) so the admin gets a
 * clear "user added" message instead of a silent refresh. The form clears
 * itself on success via a `key` bumped from the result.
 */
export function AddUserForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<AddUserResult | null, FormData>(
    async (_prev, fd) => addUser(fd),
    null,
  );
  return (
    <form action={formAction} key={state?.ok ? state.message : "form"}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="field">
          <label>{t("Name")}</label>
          <input className="inp" type="text" name="name" placeholder={t("Full name")} required />
        </div>
        <div className="field">
          <label>{t("Mobile")}</label>
          <input className="inp" type="tel" name="phone" placeholder={t("10-digit mobile")} maxLength={10} required />
        </div>
      </div>
      <button className="btn btn-primary mt-4" type="submit" disabled={pending}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        {pending ? t("Adding…") : t("Add user")}
      </button>

      {state && (
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
      )}
      {!state && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "var(--bg-soft)" }}>
          <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
          <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {t("Password is the mobile number until first login; assign access below.")}
          </p>
        </div>
      )}
    </form>
  );
}

/** Bordered pill wrapping a checkbox — highlights in the accent colour when on,
 * matching the depot/area selectors in the reference design. */
function pillStyle(checked: boolean): React.CSSProperties {
  return {
    borderColor: checked ? "var(--accent)" : "var(--hairline)",
    background: checked ? "var(--accent-tint)" : "#fff",
    color: checked ? "var(--accent)" : "var(--ink-2)",
  };
}

export function RoleCheckbox({
  userId,
  role,
  checked,
}: {
  userId: string;
  role: AccessRole;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={() => start(() => toggleAccessRole(userId, role))}
    />
  );
}

/**
 * "Select all" / "Clear" for one stockist's areas.
 *
 * One write for the whole group rather than a click per pill — a sub-dealer
 * with thirty areas is otherwise a minute of clicking. Shows how many are on
 * so the state is readable without counting the pills.
 */
export function AreaGroupToggle({
  userId,
  stockistId,
  checkedCount,
  total,
}: {
  userId: string;
  stockistId: string;
  checkedCount: number;
  total: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const allOn = checkedCount === total;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[10.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
        {checkedCount}/{total}
      </span>
      <button
        type="button"
        className="link text-[10.5px]"
        disabled={pending}
        onClick={() => start(() => setUserAreasForStockist(userId, stockistId, !allOn))}
      >
        {pending ? t("Saving…") : allOn ? t("Clear all") : t("Select all")}
      </button>
    </span>
  );
}

export function AreaCheckbox({
  userId,
  areaId,
  name,
  checked,
}: {
  userId: string;
  areaId: string;
  name: string;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
      style={pillStyle(checked)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        style={{ accentColor: "var(--accent)" }}
        onChange={() => start(() => toggleUserArea(userId, areaId))}
      />
      {name}
    </label>
  );
}

export function DepotCheckbox({
  userId,
  stockistId,
  name,
  checked,
}: {
  userId: string;
  stockistId: string;
  name: string;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
      style={pillStyle(checked)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        style={{ accentColor: "var(--accent)" }}
        onChange={() => start(() => toggleUserDepot(userId, stockistId))}
      />
      {name}
    </label>
  );
}

export type StockistOpt = {
  id: string;
  name: string;
  kind: StockistKind;
  /** Set on a sub-dealer only — the dealer it sits under. */
  parentId: string | null;
};

export type DepotGroup = { cnfId: string; cnfName: string; stockists: StockistOpt[] };

/**
 * Sales Officer's depot assignment: pick the C&F, then check depot(s) from just
 * that C&F's list. An SO supervises stockists under a single C&F, so — like
 * `DepotSelect` — this narrows rather than just groups.
 *
 * Defaults to the C&F of whichever depot is already checked, if any. If a row
 * has checked stockists in more than one C&F (stale data from before this rule),
 * only one C&F's checkboxes show at a time; the note below surfaces the rest
 * rather than hiding them silently.
 */
export function SupervisorDepotPicker({
  userId,
  groups,
  checkedDepotIds,
}: {
  userId: string;
  groups: DepotGroup[];
  checkedDepotIds: Set<string>;
}) {
  const t = useT();
  const [cnfId, setCnfId] = useState(() => {
    for (const g of groups) {
      if (g.stockists.some((d) => checkedDepotIds.has(d.id))) return g.cnfId;
    }
    return "";
  });
  const activeGroup = groups.find((g) => g.cnfId === cnfId);
  const otherCheckedCount = [...checkedDepotIds].filter(
    (id) => !activeGroup?.stockists.some((d) => d.id === id),
  ).length;

  return (
    <div className="flex flex-col gap-1.5">
      <select
        className="inp"
        style={{ padding: "5px 8px", fontSize: 12 }}
        value={cnfId}
        onChange={(e) => setCnfId(e.target.value)}
      >
        <option value="">{t("Select C&F")}</option>
        {groups.map((g) => (
          <option key={g.cnfId} value={g.cnfId}>{g.cnfName}</option>
        ))}
      </select>
      {activeGroup && (
        <div className="flex flex-wrap gap-1.5">
          {activeGroup.stockists.map((d) => (
            <DepotCheckbox
              key={d.id}
              userId={userId}
              stockistId={d.id}
              // A sub-dealer is labelled under its dealer, so a flat list of
              // checkboxes still says where each one sits.
              name={
                d.parentId
                  ? `${activeGroup.stockists.find((x) => x.id === d.parentId)?.name ?? ""} › ${d.name}`
                  : d.name
              }
              checked={checkedDepotIds.has(d.id)}
            />
          ))}
        </div>
      )}
      {otherCheckedCount > 0 && (
        <p className="text-[11px]" style={{ color: "var(--warning)" }}>
          + {otherCheckedCount} {t(otherCheckedCount === 1 ? "depot checked under another C&F (legacy) — switch C&F above to see them." : "depots checked under another C&F (legacy) — switch C&F above to see them.")}
        </p>
      )}
    </div>
  );
}

/** Which group (if any) currently contains `stockistId`. */
function groupFor(groups: DepotGroup[], stockistId: string | null): DepotGroup | undefined {
  return stockistId ? groups.find((g) => g.stockists.some((d) => d.id === stockistId)) : undefined;
}

/**
 * Two-step cascade: pick the C&F, then pick a depot from just that C&F's list.
 * A user's depot always belongs to exactly one C&F, so this is a genuine
 * narrowing (not just grouping) — with many stockists, a flat list is a hunt.
 *
 * The C&F select is local UI state only (no server write) — it just decides
 * which stockists the second dropdown offers. The actual assignment commits only
 * when a depot is chosen, via the existing `setUserDepot` action.
 */
export function DepotSelect({
  userId,
  value,
  groups,
}: {
  userId: string;
  value: string | null;
  groups: DepotGroup[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [cnfId, setCnfId] = useState(() => groupFor(groups, value)?.cnfId ?? "");

  const inCnf = groups.find((g) => g.cnfId === cnfId)?.stockists ?? [];
  // Only depots and dealers at this level; a sub-dealer is reached THROUGH its
  // dealer, so listing it here too would say it stands alongside its parent.
  const topLevel = inCnf.filter((d) => d.parentId === null);

  // A saved sub-dealer shows as its parent here, with the sub-dealer select
  // below holding the real value — otherwise the top select would read blank
  // for a perfectly valid assignment.
  const current = inCnf.find((d) => d.id === value) ?? null;
  const topId = current ? (current.parentId ?? current.id) : "";
  const [parentId, setParentId] = useState(topId);

  const parent = topLevel.find((d) => d.id === parentId) ?? null;
  const subDealers = parent?.kind === "dealer" ? inCnf.filter((d) => d.parentId === parent.id) : [];

  function assign(stockistId: string) {
    const fd = new FormData();
    fd.set("depotId", stockistId);
    start(() => setUserDepot(userId, fd));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        className="inp"
        style={{ padding: "5px 8px", fontSize: 12 }}
        value={cnfId}
        onChange={(e) => {
          setCnfId(e.target.value);
          setParentId("");
        }}
      >
        <option value="">{t("Select C&F")}</option>
        {groups.map((g) => (
          <option key={g.cnfId} value={g.cnfId}>{g.cnfName}</option>
        ))}
      </select>

      <select
        className="inp"
        style={{ padding: "5px 8px", fontSize: 12 }}
        // Remount when the C&F changes so an uncommitted choice from the
        // PREVIOUS C&F never lingers as this select's displayed value.
        key={cnfId}
        value={parentId}
        disabled={pending || !cnfId}
        onChange={(e) => {
          const next = e.target.value;
          setParentId(next);
          // Assigning the parent is what the sub-dealer select is for when one
          // exists, so only commit here when there is nothing to narrow into —
          // otherwise merely opening the cascade would reassign the rep.
          const picked = topLevel.find((d) => d.id === next);
          const hasChildren = picked?.kind === "dealer" && inCnf.some((d) => d.parentId === picked.id);
          if (next && !hasChildren) assign(next);
        }}
      >
        <option value="">{cnfId ? t("Select stockist") : t("Pick a C&F first")}</option>
        {topLevel.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.kind === "dealer" ? ` (${t("Dealer")})` : ""}
          </option>
        ))}
      </select>

      {subDealers.length > 0 && (
        <select
          className="inp"
          style={{ padding: "5px 8px", fontSize: 12 }}
          key={`sub-${parentId}`}
          value={current?.parentId ? current.id : ""}
          disabled={pending}
          onChange={(e) => assign(e.target.value || parentId)}
        >
          {/* Blank means the dealer itself, not "nothing chosen". */}
          <option value="">{t("— the dealer itself")}</option>
          {subDealers.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** C&F HQ dropdown for the hq role — the access-control modification. */
export function CnfSelect({
  userId,
  value,
  options,
}: {
  userId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <select
      className="inp"
      style={{ padding: "5px 8px", fontSize: 12 }}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("cnfId", e.target.value);
        start(() => setUserCnf(userId, fd));
      }}
    >
      <option value="">{t("Select C&F HQ")}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

/** Supervisor (SO) dropdown — which SO a field rep reports to. */
export function SupervisorSelect({
  userId,
  value,
  options,
}: {
  userId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <select
      className="inp"
      style={{ padding: "5px 8px", fontSize: 12 }}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("reportsToUserId", e.target.value);
        start(() => setUserReportsTo(userId, fd));
      }}
    >
      <option value="">{t("Select supervisor")}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

/**
 * Deactivate / reactivate — the reversible alternative to deleting a user.
 * Deactivating blocks their login and logs them out on the next request while
 * keeping every visit and counter; reactivating restores access.
 */
export function ActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={active ? t("Deactivate — blocks login, keeps their data") : t("Reactivate this user")}
      onClick={() => start(() => setUserActive(userId, !active))}
      className="flex h-9 items-center justify-center rounded-lg px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50"
      style={
        active
          ? // Deactivate: amber-tinted outline.
            { border: "1px solid var(--hairline)", color: "var(--warning)", background: "var(--surface)" }
          : // Activate: same outline treatment, green border/text.
            { border: "1px solid var(--success)", color: "var(--success)", background: "var(--surface)" }
      }
    >
      {pending ? "…" : active ? t("Deactivate") : t("Activate")}
    </button>
  );
}

/** Trash-icon delete. Uses the app-wide confirmation dialog rather than the
 * native `confirm()`, so every delete in the portal looks and behaves alike. */
export function DeleteUserButton({ userId, userName }: { userId: string; userName?: string }) {
  const t = useT();
  return (
    <ConfirmDelete
      action={async () => {
        await removeUser(userId);
      }}
      itemLabel={t("user")}
      itemName={userName}
      trigger="icon"
      warning={t("This also permanently deletes all their visits and day logs. To keep their history, deactivate them instead.")}
    />
  );
}

/**
 * Card wrapper for the users table: header (icon, title, live search + C&F
 * filter) plus the server-rendered table passed as children. Both filters are
 * client-side — each row carries `data-search` and `data-cnf`, so filtering
 * needs no refetch or server state. Search and C&F are AND-combined.
 *
 * The C&F filter is why this page cascades cleanly: picking one shows only that
 * C&F's field/SO/depot users, so the depot/area dropdowns and pill-checkboxes
 * you're about to touch aren't hidden behind unrelated rows.
 */
export function UsersPanel({
  children,
  cnfOptions,
}: {
  children: React.ReactNode;
  cnfOptions: { id: string; name: string }[];
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [cnf, setCnf] = useState("all");

  function apply(nextQ: string, nextCnf: string) {
    const needle = nextQ.trim().toLowerCase();
    const rows = ref.current?.querySelectorAll<HTMLElement>("[data-user-row]");
    rows?.forEach((row) => {
      const hay = row.getAttribute("data-search") ?? "";
      const cnfs = row.getAttribute("data-cnf") ?? "";
      const passesSearch = needle.length === 0 || hay.includes(needle);
      // Space-separated ids; wrap with spaces so an id can't substring-match another.
      const passesCnf = nextCnf === "all" || ` ${cnfs} `.includes(` ${nextCnf} `);
      row.classList.toggle("hidden", !(passesSearch && passesCnf));
    });
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5" style={{ borderColor: "var(--hairline-soft)" }}>
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)" }}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </span>
          <div>
            <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{t("Users")}</div>
            <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("Manage roles, mapping and reporting structure.")}</div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            className="inp"
            style={{ width: "auto", minWidth: 180 }}
            value={cnf}
            onChange={(e) => {
              setCnf(e.target.value);
              apply(q, e.target.value);
            }}
            aria-label={t("Filter by C&F HQ")}
          >
            <option value="all">{t("All C&F HQs")}</option>
            {cnfOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="relative w-full sm:w-72">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="inp"
              style={{ paddingLeft: 36 }}
              type="search"
              value={q}
              placeholder={t("Search by name or mobile…")}
              onChange={(e) => {
                setQ(e.target.value);
                apply(e.target.value, cnf);
              }}
            />
          </div>
        </div>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}

/**
 * Reset a user's password to their mobile number.
 *
 * Two-step on purpose: the first click arms it, the second commits. This is a
 * credential change that locks the user out of whatever they were using, and
 * it sits inches from "Dismiss" in the request list — a stray click should not
 * be able to do it.
 */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="text-[12px] font-semibold" style={{ color: "var(--success)" }}>
        {done}
      </span>
    );
  }

  if (!armed) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setArmed(true)}>
        {t("Reset password")}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        {t("Set to mobile number?")}
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resetUserPassword(userId);
            if (res.ok) setDone(t("Password reset"));
            else {
              setArmed(false);
              alert(res.message);
            }
          })
        }
      >
        {pending ? t("Resetting…") : t("Confirm")}
      </button>
      <button type="button" className="link" onClick={() => setArmed(false)} disabled={pending}>
        {t("Cancel")}
      </button>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/**
 * Edit a user's name and mobile, and reset their password, from one popover on
 * their row.
 *
 * The mobile is also the login id, so this is the only place it can be
 * corrected — a typo in it locks someone out of the app entirely, and before
 * this the only fix was deleting the user, which cascades away their whole
 * visit history.
 */
export function EditUserButton({
  userId,
  name,
  phone,
}: {
  userId: string;
  name: string;
  phone: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="link inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        aria-label={`${t("Edit")} ${name}`}
      >
        {t("Edit")}
      </button>
    );
  }

  return (
    <div
      className="mt-2 rounded-xl border p-3"
      style={{ borderColor: "var(--hairline)", background: "var(--bg-soft)", minWidth: 240 }}
    >
      <form
        action={(formData) =>
          start(async () => {
            const res = await updateUser(userId, formData);
            setMessage({ ok: res.ok, text: res.message });
            if (res.ok) setOpen(false);
          })
        }
        className="flex flex-col gap-2"
      >
        <label className="field mb-0">
          <span className="text-[11px] font-semibold" style={{ color: "var(--ink-3)" }}>
            {t("Name")}
          </span>
          <input className="inp" name="name" defaultValue={name} maxLength={120} />
        </label>
        <label className="field mb-0">
          <span className="text-[11px] font-semibold" style={{ color: "var(--ink-3)" }}>
            {t("Mobile")}
          </span>
          <input
            className="inp"
            name="phone"
            defaultValue={phone}
            inputMode="tel"
            maxLength={10}
            pattern="\d{10}"
          />
        </label>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
            {pending ? t("Saving…") : t("Save")}
          </button>
          <button type="button" className="link" onClick={() => setOpen(false)} disabled={pending}>
            {t("Cancel")}
          </button>
        </div>
      </form>

      <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--hairline-soft)" }}>
        <ResetPasswordButton userId={userId} name={name} />
      </div>

      {message && !message.ok && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
