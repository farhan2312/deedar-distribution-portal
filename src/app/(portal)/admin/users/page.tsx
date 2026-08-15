import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, areas, cnfs, depots, userAreas, userDepots, users, type AccessRole } from "@/db/schema";
import { approveAccessRequest, rejectAccessRequest } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { NavIconView } from "../../_components/nav-icons";
import {
  AddUserForm,
  AreaCheckbox,
  CnfSelect,
  ActiveToggle,
  DeleteUserButton,
  DepotSelect,
  SupervisorDepotPicker,
  RoleCheckbox,
  SupervisorSelect,
  UsersPanel,
} from "./controls";

const REQUEST_STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  approved: { label: "Approved", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  rejected: { label: "Rejected", bg: "rgba(199,38,59,.1)", color: "#C7263B" },
};

const ROLE_COLS: { role: AccessRole; label: string }[] = [
  { role: "field", label: "Field ISR" },
  { role: "supervisor", label: "Sales Officer" },
  { role: "dealer", label: "Depot" },
  { role: "hq", label: "C&F HQ" },
  { role: "khq", label: "Kanpur HQ" },
  { role: "admin", label: "Admin" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const reviewer = alias(users, "reviewer");
  const [allUsers, allDepots, allCnfs, allAreas, allUserAreas, allUserDepots, requestRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(depots).orderBy(asc(depots.name)),
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
    db.select().from(userAreas),
    db.select().from(userDepots),
    db
      .select({
        id: accessRequests.id,
        name: accessRequests.name,
        phone: accessRequests.phone,
        requestedRole: accessRequests.requestedRole,
        status: accessRequests.status,
        createdAt: accessRequests.createdAt,
        reviewedAt: accessRequests.reviewedAt,
        reviewerName: reviewer.name,
      })
      .from(accessRequests)
      .leftJoin(reviewer, eq(reviewer.id, accessRequests.reviewedByUserId))
      .orderBy(desc(accessRequests.createdAt)),
  ]);
  const pendingRequests = requestRows.filter((r) => r.status === "pending");
  const decidedRequests = requestRows.filter((r) => r.status !== "pending");

  // Depots grouped by their C&F. A user's depot(s) belong to exactly one C&F
  // (a Sales Officer supervises depots under a single C&F), so the picker is a
  // real two-step cascade — pick the C&F, then only that C&F's depots show —
  // rather than one long flat list to hunt through as depots grow.
  const depotGroups = allCnfs
    .map((c) => ({
      cnfId: c.id,
      cnfName: c.name,
      depots: allDepots.filter((d) => d.cnfId === c.id).map((d) => ({ id: d.id, name: d.name })),
    }))
    .filter((g) => g.depots.length > 0);
  const cnfOptions = allCnfs.map((c) => ({ id: c.id, name: c.name }));
  // A field rep reports to a Supervisor (SO) — only supervisors are options.
  const supervisorOptions = allUsers
    .filter((u) => u.accessRoles.includes("supervisor"))
    .map((u) => ({ id: u.id, name: u.name }));
  const areasByDepot = new Map<string, typeof allAreas>();
  for (const a of allAreas) areasByDepot.set(a.depotId, [...(areasByDepot.get(a.depotId) ?? []), a]);

  const userAreaSet = new Map<string, Set<string>>();
  for (const ua of allUserAreas) {
    if (!userAreaSet.has(ua.userId)) userAreaSet.set(ua.userId, new Set());
    userAreaSet.get(ua.userId)!.add(ua.areaId);
  }
  const userDepotSet = new Map<string, Set<string>>();
  for (const ud of allUserDepots) {
    if (!userDepotSet.has(ud.userId)) userDepotSet.set(ud.userId, new Set());
    userDepotSet.get(ud.userId)!.add(ud.depotId);
  }

  // The C&F(s) a user belongs to, for the client-side C&F filter. Derived here
  // rather than at render time because different roles reach a C&F differently:
  //   • hq            → users.cnfId directly
  //   • field/dealer  → depots[users.depotId].cnfId
  //   • supervisor    → depots[userDepots.depotId].cnfId  (can be multiple)
  // Admin/khq are cross-C&F, so no filter membership.
  const cnfByDepot = new Map<string, string>();
  for (const d of allDepots) cnfByDepot.set(d.id, d.cnfId);
  const userCnfIds = new Map<string, Set<string>>();
  for (const u of allUsers) {
    const cnfs = new Set<string>();
    if (u.cnfId) cnfs.add(u.cnfId);
    if (u.depotId) {
      const c = cnfByDepot.get(u.depotId);
      if (c) cnfs.add(c);
    }
    for (const depotId of userDepotSet.get(u.id) ?? []) {
      const c = cnfByDepot.get(depotId);
      if (c) cnfs.add(c);
    }
    userCnfIds.set(u.id, cnfs);
  }

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Own header (customHeader in nav) so the stat cards share the title row. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-white"
            style={{ background: "var(--accent)", boxShadow: "var(--shadow-sm)" }}
          >
            <NavIconView icon="userCog" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="page-title">Users &amp; access</h1>
            <p className="page-subtitle max-w-xl">
              Central Admin adds every user and controls which sections they see
              in their sidebar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <StatCard
            icon={<UsersIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />}
            iconBg="var(--accent-tint)"
            label="Total users"
            value={allUsers.length}
            sub={`${allUsers.filter((u) => u.isActive).length} active`}
          />
          <StatCard
            icon={<ClockIcon className="h-5 w-5" style={{ color: pendingRequests.length > 0 ? "#B25E00" : "var(--ink-3)" }} />}
            iconBg={pendingRequests.length > 0 ? "rgba(224,177,92,.2)" : "var(--bg-soft)"}
            label="Pending requests"
            value={pendingRequests.length}
            sub="Awaiting approval"
          />
        </div>
      </div>

      {/* Add user + Access requests */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <SectionHead icon={<UserPlusIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />} title="Add a user" />
          <AddUserForm />
        </div>

        <div className="card p-6">
          <SectionHead
            icon={<ClockIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />}
            title={`Access requests — Pending (${pendingRequests.length})`}
          />
          <p className="mb-4 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
            Submitted via &ldquo;Request Access&rdquo; on the login page. Approve to
            create their account with the requested role and password they set;
            map depot/C&amp;F/reports-to below afterward.
          </p>
          {pendingRequests.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border p-5" style={{ borderColor: "rgba(30,158,90,.25)", background: "rgba(30,158,90,.06)" }}>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: "rgba(30,158,90,.15)" }}>
                <CheckIcon className="h-5 w-5" style={{ color: "#1E9E5A" }} />
              </span>
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "#1E9E5A" }}>No pending requests.</div>
                <div className="text-[13px]" style={{ color: "var(--ink-2)" }}>You&rsquo;re all caught up!</div>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {pendingRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
                  <div>
                    <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{r.name}</div>
                    <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {r.phone} · {ROLE_LABEL[r.requestedRole]} · {formatISTDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <form action={approveAccessRequest.bind(null, r.id)} className="inline">
                      <button className="btn btn-primary btn-sm" type="submit">Approve</button>
                    </form>
                    <form action={rejectAccessRequest.bind(null, r.id)} className="inline">
                      <button className="link link-danger" type="submit">Reject</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {decidedRequests.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
            Access requests — decided ({decidedRequests.length})
          </summary>
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Requested role</th>
                  <th>Status</th>
                  <th>Reviewed by</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {decidedRequests.map((r) => {
                  const st = REQUEST_STATUS_STYLE[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{r.name}</td>
                      <td className="whitespace-nowrap">{r.phone}</td>
                      <td>{ROLE_LABEL[r.requestedRole]}</td>
                      <td>
                        <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                          {st.label}
                        </span>
                      </td>
                      <td>{r.reviewerName ?? "—"}</td>
                      <td className="whitespace-nowrap">
                        {r.reviewedAt ? `${formatISTDate(r.reviewedAt)} · ${formatISTTime(r.reviewedAt)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <UsersPanel cnfOptions={cnfOptions}>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 1040 }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Mobile</th>
                {ROLE_COLS.map((c) => (
                  <th key={c.role} className="text-center">{c.label}</th>
                ))}
                <th>Mapping</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => {
                const roleSet = new Set(u.accessRoles);
                const depotAreas = u.depotId ? (areasByDepot.get(u.depotId) ?? []) : [];
                return (
                  <tr
                    key={u.id}
                    data-user-row
                    data-search={`${u.name} ${u.phone}`.toLowerCase()}
                    // Space-separated so the filter can substring-match one id.
                    // Admin / khq / unmapped users have an empty attribute and are
                    // therefore hidden when a specific C&F is picked (they don't
                    // belong to it) but visible under "All C&F".
                    data-cnf={[...(userCnfIds.get(u.id) ?? [])].join(" ")}
                    // Muted via a background tint, NOT row opacity — opacity on
                    // the row would cap the action buttons' contrast too, which
                    // is exactly what made the Activate button look dead.
                    style={u.isActive ? undefined : { background: "var(--bg-soft)" }}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-bold" style={{ background: "var(--accent-tint)", color: u.isActive ? "var(--accent)" : "var(--ink-3)" }}>
                          {initials(u.name)}
                        </span>
                        <div>
                          <div className="font-semibold whitespace-nowrap" style={{ color: u.isActive ? "var(--ink-1)" : "var(--ink-3)" }}>{u.name}</div>
                          {u.isActive ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(30,158,90,.12)", color: "#1E9E5A" }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1E9E5A" }} />
                              Active
                            </span>
                          ) : (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--bg-soft)", color: "var(--ink-3)" }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ink-3)" }} />
                              Deactivated
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{u.phone}</td>
                    {ROLE_COLS.map((c) => (
                      <td key={c.role} className="text-center">
                        <RoleCheckbox userId={u.id} role={c.role} checked={roleSet.has(c.role)} />
                      </td>
                    ))}
                    <td style={{ minWidth: 240 }}>
                      {roleSet.has("admin") ? (
                        <Mapping label="Admin">
                          <Text>Full access — every section. No depot / C&amp;F / area needed.</Text>
                        </Mapping>
                      ) : (
                      <>
                      {roleSet.has("field") && (
                        <>
                          <Mapping label="Depot (Field ISR)">
                            <DepotSelect userId={u.id} value={u.depotId} groups={depotGroups} />
                            {u.depotId && depotAreas.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {depotAreas.map((a) => (
                                  <AreaCheckbox key={a.id} userId={u.id} areaId={a.id} name={a.name} checked={userAreaSet.get(u.id)?.has(a.id) ?? false} />
                                ))}
                              </div>
                            )}
                          </Mapping>
                          <Mapping label="Reports to (SO)">
                            <SupervisorSelect
                              userId={u.id}
                              value={u.reportsToUserId}
                              options={supervisorOptions.filter((s) => s.id !== u.id)}
                            />
                          </Mapping>
                        </>
                      )}
                      {roleSet.has("supervisor") && (
                        <Mapping label="Depots (Sales Officer)">
                          <SupervisorDepotPicker
                            userId={u.id}
                            groups={depotGroups}
                            checkedDepotIds={userDepotSet.get(u.id) ?? new Set()}
                          />
                        </Mapping>
                      )}
                      {roleSet.has("dealer") && !roleSet.has("field") && (
                        <Mapping label="Depot (Dealer)">
                          <DepotSelect userId={u.id} value={u.depotId} groups={depotGroups} />
                        </Mapping>
                      )}
                      {roleSet.has("hq") && (
                        <Mapping label="C&F HQ">
                          <CnfSelect userId={u.id} value={u.cnfId} options={cnfOptions} />
                        </Mapping>
                      )}
                      {roleSet.has("khq") && <Mapping label="Kanpur HQ"><Text>Company-wide</Text></Mapping>}
                      </>
                      )}
                    </td>
                    <td>
                      {u.id !== admin.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <ActiveToggle userId={u.id} active={u.isActive} />
                          <DeleteUserButton userId={u.id} userName={u.name} />
                        </div>
                      ) : (
                        <span className="block text-center text-[11px]" style={{ color: "var(--ink-3)" }}>you</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </UsersPanel>
    </div>
  );
}

function StatCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: number; sub: string }) {
  return (
    <div className="card flex items-center gap-3.5 px-5 py-4" style={{ minWidth: 190 }}>
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl" style={{ background: iconBg }}>{icon}</span>
      <div>
        <div className="text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>{label}</div>
        <div className="text-[24px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{value}</div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>{sub}</div>
      </div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)" }}>{icon}</span>
      <h6 className="text-[16px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{title}</h6>
    </div>
  );
}

function Mapping({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>{label}</div>
      {children}
    </div>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px]" style={{ color: "var(--ink-2)" }}>{children}</div>;
}

function UsersIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function UserPlusIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function ClockIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
