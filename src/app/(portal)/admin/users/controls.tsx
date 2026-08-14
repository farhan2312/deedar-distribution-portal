"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { AccessRole } from "@/db/schema";
import {
  addUser,
  removeUser,
  setUserCnf,
  setUserDepot,
  setUserReportsTo,
  toggleAccessRole,
  toggleUserArea,
  toggleUserDepot,
  type AddUserResult,
} from "@/lib/admin/actions";

/**
 * "Add a user" form with inline confirmation. `useActionState` keeps the
 * server action's result (added / duplicate / invalid) so the admin gets a
 * clear "user added" message instead of a silent refresh. The form clears
 * itself on success via a `key` bumped from the result.
 */
export function AddUserForm() {
  const [state, formAction, pending] = useActionState<AddUserResult | null, FormData>(
    async (_prev, fd) => addUser(fd),
    null,
  );
  return (
    <form action={formAction} key={state?.ok ? state.message : "form"}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="field">
          <label>Name</label>
          <input className="inp" type="text" name="name" placeholder="Full name" required />
        </div>
        <div className="field">
          <label>Mobile</label>
          <input className="inp" type="tel" name="phone" placeholder="10-digit mobile" maxLength={10} required />
        </div>
      </div>
      <button className="btn btn-primary mt-4" type="submit" disabled={pending}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        {pending ? "Adding…" : "Add user"}
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
            Password is the mobile number until first login; assign access below.
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
  depotId,
  name,
  checked,
}: {
  userId: string;
  depotId: string;
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
        onChange={() => start(() => toggleUserDepot(userId, depotId))}
      />
      {name}
    </label>
  );
}

export function DepotSelect({
  userId,
  value,
  options,
}: {
  userId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="inp"
      style={{ padding: "5px 8px", fontSize: 12 }}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("depotId", e.target.value);
        start(() => setUserDepot(userId, fd));
      }}
    >
      <option value="">Select depot</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
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
      <option value="">Select C&amp;F HQ</option>
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
      <option value="">Select supervisor</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

/** Trash-icon delete, with a confirm so a stray click can't drop an account. */
export function DeleteUserButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove user"
      title="Remove user"
      disabled={pending}
      onClick={() => {
        if (confirm("Remove this user? This cannot be undone.")) {
          start(() => removeUser(userId));
        }
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--hairline)", color: "var(--danger)", background: "var(--surface)" }}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

/**
 * Card wrapper for the users table: header (icon, title, live search) plus the
 * server-rendered table passed as children. Search filters rows client-side by
 * the `data-search` attribute each row carries — no refetch, no extra state on
 * the server.
 */
export function UsersPanel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");

  function onChange(value: string) {
    setQ(value);
    const needle = value.trim().toLowerCase();
    const rows = ref.current?.querySelectorAll<HTMLElement>("[data-user-row]");
    rows?.forEach((row) => {
      const hay = row.getAttribute("data-search") ?? "";
      row.classList.toggle("hidden", needle.length > 0 && !hay.includes(needle));
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
            <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>Users</div>
            <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>Manage roles, mapping and reporting structure.</div>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="inp"
            style={{ paddingLeft: 36 }}
            type="search"
            value={q}
            placeholder="Search by name or mobile…"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}
