import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accessRequests,
  areas,
  cnfs,
  stockists,
  passwordResetRequests,
  users,
  type AccessRole,
} from "@/db/schema";
import { approveAccessRequest, dismissPasswordReset, rejectAccessRequest } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import {
  fetchAssignmentsFor,
  fetchSupervisorOptions,
  fetchUsersPage,
  type UsersListParams,
} from "@/lib/admin/users-list";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { getT } from "@/lib/i18n/server";
import {
  AddUserForm,
  AreaCheckbox,
  AreaGroupToggle,
  CnfSelect,
  ActiveToggle,
  DeleteUserButton,
  EditUserButton,
  ResetPasswordButton,
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
  { role: "depot", label: "Depot" },
  { role: "dealer", label: "Dealer" },
  { role: "hq", label: "C&F HQ" },
  { role: "khq", label: "Kanpur HQ" },
  { role: "admin", label: "Admin" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<UsersListParams>;
}) {
  const admin = await requireAdmin();
  const t = await getT();
  const params = await searchParams;

  const reviewer = alias(users, "reviewer");
  const [
    allStockists,
    allCnfs,
    allAreas,
    supervisorOptions,
    requestRows,
    resetRows,
  ] = await Promise.all([
    db.select().from(stockists).orderBy(asc(stockists.name)),
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
    // The whole roster, not just this page — a rep on page 1 can report to a
    // supervisor on page 3.
    fetchSupervisorOptions(),
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
    // Open "I forgot my password" requests. Left-joined to users so a number
    // that matches no account still shows — that is worth an admin's eye, not
    // something to hide.
    db
      .select({
        id: passwordResetRequests.id,
        phone: passwordResetRequests.phone,
        createdAt: passwordResetRequests.createdAt,
        userId: passwordResetRequests.userId,
        userName: users.name,
      })
      .from(passwordResetRequests)
      .leftJoin(users, eq(users.id, passwordResetRequests.userId))
      .where(eq(passwordResetRequests.status, "pending"))
      .orderBy(desc(passwordResetRequests.createdAt)),
  ]);
  // Users are paged, searched and C&F-filtered in SQL. The join tables are
  // then read for this page's 25 users only, rather than in full.
  const list = await fetchUsersPage(
    params,
    allCnfs.map((c) => c.id),
  );
  const pageUsers = list.rows;
  const { areasByUser: userAreaSet, stockistsByUser: userDepotSet } =
    await fetchAssignmentsFor(pageUsers.map((u) => u.id));

  const pendingRequests = requestRows.filter((r) => r.status === "pending");
  const decidedRequests = requestRows.filter((r) => r.status !== "pending");

  // Depots grouped by their C&F. A user's depot(s) belong to exactly one C&F
  // (a Sales Officer supervises stockists under a single C&F), so the picker is a
  // real two-step cascade — pick the C&F, then only that C&F's stockists show —
  // rather than one long flat list to hunt through as stockists grow.
  const depotGroups = allCnfs
    .map((c) => ({
      cnfId: c.id,
      cnfName: c.name,
      stockists: allStockists
        .filter((d) => d.cnfId === c.id)
        .map((d) => ({ id: d.id, name: d.name, kind: d.kind, parentId: d.parentId })),
    }))
    .filter((g) => g.stockists.length > 0);
  const cnfOptions = allCnfs.map((c) => ({ id: c.id, name: c.name }));
  const areasByDepot = new Map<string, typeof allAreas>();
  for (const a of allAreas) areasByDepot.set(a.stockistId, [...(areasByDepot.get(a.stockistId) ?? []), a]);

  /**
   * Areas a rep at `stockistId` may cover, grouped by the stockist that owns
   * them.
   *
   * A dealer's list includes its sub-dealers', so a rep assigned to the dealer
   * can be given sub-dealer areas without being moved off the dealer — moving
   * them was what cleared their existing ticks. A depot or sub-dealer has no
   * children, so its list is just its own.
   */
  const areaGroupsFor = (stockistId: string) => {
    const self = allStockists.find((s) => s.id === stockistId);
    if (!self) return [];
    const family = [self, ...allStockists.filter((s) => s.parentId === self.id)];
    return family
      .map((s) => ({ id: s.id, name: s.name, areas: areasByDepot.get(s.id) ?? [] }))
      .filter((g) => g.areas.length > 0);
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* The title sits in the top bar, so the page opens on the numbers. */}
      <div className="mb-6 flex flex-wrap gap-3">
        <StatCard
          icon={<UsersIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />}
          iconBg="var(--accent-tint)"
          label={t("Total users")}
          value={list.totalUsers}
          sub={`${list.activeUsers} ${t("active")}`}
        />
        <StatCard
          icon={<ClockIcon className="h-5 w-5" style={{ color: pendingRequests.length > 0 ? "#B25E00" : "var(--ink-3)" }} />}
          iconBg={pendingRequests.length > 0 ? "rgba(224,177,92,.2)" : "var(--bg-soft)"}
          label={t("Pending requests")}
          value={pendingRequests.length}
          sub={t("Awaiting approval")}
        />
      </div>

      {/* Add user + Access requests */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <SectionHead icon={<UserPlusIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />} title={t("Add a user")} />
          <AddUserForm />
        </div>

        <div className="card p-6">
          <SectionHead
            icon={<ClockIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />}
            title={`${t("Access requests — Pending")} (${pendingRequests.length})`}
          />
          <p className="mb-4 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
            {t('Submitted via "Request Access" on the login page. Approve to create their account with the requested role and password they set; map depot/C&F/reports-to below afterward.')}
          </p>
          {pendingRequests.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border p-5" style={{ borderColor: "rgba(30,158,90,.25)", background: "rgba(30,158,90,.06)" }}>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: "rgba(30,158,90,.15)" }}>
                <CheckIcon className="h-5 w-5" style={{ color: "#1E9E5A" }} />
              </span>
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "#1E9E5A" }}>{t("No pending requests.")}</div>
                <div className="text-[13px]" style={{ color: "var(--ink-2)" }}>{t("You're all caught up!")}</div>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {pendingRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
                  <div>
                    <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{r.name}</div>
                    <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {r.phone} · {t(ROLE_LABEL[r.requestedRole])} · {formatISTDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <form action={approveAccessRequest.bind(null, r.id)} className="inline">
                      <button className="btn btn-primary btn-sm" type="submit">{t("Approve")}</button>
                    </form>
                    <form action={rejectAccessRequest.bind(null, r.id)} className="inline">
                      <button className="link link-danger" type="submit">{t("Reject")}</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Password reset requests — raised from the login page's "Forgot
          password?" link. There is no email or SMS channel in this app, so an
          admin actioning it here IS the verification step. */}
      <div className="card mb-6 p-6">
        <SectionHead
          icon={
            <KeyIcon
              className="h-5 w-5"
              style={{ color: resetRows.length > 0 ? "#B25E00" : "var(--ink-3)" }}
            />
          }
          title={`${t("Password reset requests")} (${resetRows.length})`}
        />
        <p className="mb-4 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {t("Resetting sets the password to the user's mobile number and forces them to change it at next login. Tell them in person or by phone — the app cannot.")}
        </p>
        {resetRows.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("No password reset requests.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {resetRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
                    {r.userName ?? t("No account with this number")}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {r.phone} · {formatISTDate(r.createdAt)} {formatISTTime(r.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {/* No account ⇒ nothing to reset; dismissing is the only move. */}
                  {r.userId && <ResetPasswordButton userId={r.userId} name={r.userName ?? r.phone} />}
                  <form action={dismissPasswordReset.bind(null, r.id)} className="inline">
                    <button className="link link-danger" type="submit">
                      {t("Dismiss")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {decidedRequests.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
            {t("Access requests — decided")} ({decidedRequests.length})
          </summary>
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Name")}</th>
                  <th>{t("Mobile")}</th>
                  <th>{t("Requested role")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Reviewed by")}</th>
                  <th>{t("Reviewed")}</th>
                </tr>
              </thead>
              <tbody>
                {decidedRequests.map((r) => {
                  const st = REQUEST_STATUS_STYLE[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{r.name}</td>
                      <td className="whitespace-nowrap">{r.phone}</td>
                      <td>{t(ROLE_LABEL[r.requestedRole])}</td>
                      <td>
                        <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                          {t(st.label)}
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

      <UsersPanel
        cnfOptions={cnfOptions}
        filters={list.filters}
        total={list.total}
        page={list.page}
        totalPages={list.totalPages}
        pageSize={list.pageSize}
      >
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 1040 }}>
            <thead>
              <tr>
                <th>{t("User")}</th>
                <th>{t("Mobile")}</th>
                {ROLE_COLS.map((c) => (
                  <th key={c.role} className="text-center">{t(c.label)}</th>
                ))}
                <th>{t("Mapping")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((u) => {
                const roleSet = new Set(u.accessRoles);
                const areaGroups = u.stockistId ? areaGroupsFor(u.stockistId) : [];
                return (
                  <tr
                    key={u.id}
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
                              {t("Active")}
                            </span>
                          ) : (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--bg-soft)", color: "var(--ink-3)" }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ink-3)" }} />
                              {t("Deactivated")}
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
                        <Mapping label={t("Admin")}>
                          <Text>{t("Full access — every section. No stockist / C&F / area needed.")}</Text>
                        </Mapping>
                      ) : (
                      <>
                      {roleSet.has("field") && (
                        <>
                          <Mapping label={t("Stockist (Field ISR)")}>
                            <DepotSelect userId={u.id} value={u.stockistId} groups={depotGroups} />
                            {u.stockistId && areaGroups.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {areaGroups.map((g) => {
                                  const on = g.areas.filter((a) =>
                                    userAreaSet.get(u.id)?.has(a.id),
                                  ).length;
                                  return (
                                  <div key={g.id} className="w-full">
                                    {/* The heading carries the group's name and
                                        its select-all. A single-group stockist
                                        still gets the control — the name is
                                        dropped, since there is nothing to tell
                                        it apart from. */}
                                    <div className="mb-1 mt-1 flex flex-wrap items-center justify-between gap-2">
                                      <span
                                        className="text-[10.5px] font-bold uppercase tracking-wider"
                                        style={{ color: "var(--ink-3)" }}
                                      >
                                        {areaGroups.length > 1 ? g.name : t("Areas")}
                                      </span>
                                      <AreaGroupToggle
                                        userId={u.id}
                                        stockistId={g.id}
                                        checkedCount={on}
                                        total={g.areas.length}
                                      />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {g.areas.map((a) => (
                                        <AreaCheckbox
                                          key={a.id}
                                          userId={u.id}
                                          areaId={a.id}
                                          name={a.name}
                                          checked={userAreaSet.get(u.id)?.has(a.id) ?? false}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </Mapping>
                          <Mapping label={t("Reports to (SO)")}>
                            <SupervisorSelect
                              userId={u.id}
                              value={u.reportsToUserId}
                              options={supervisorOptions.filter((s) => s.id !== u.id)}
                            />
                          </Mapping>
                        </>
                      )}
                      {roleSet.has("supervisor") && (
                        <Mapping label={t("Stockists (Sales Officer)")}>
                          <SupervisorDepotPicker
                            userId={u.id}
                            groups={depotGroups}
                            checkedDepotIds={userDepotSet.get(u.id) ?? new Set()}
                          />
                        </Mapping>
                      )}
                      {(roleSet.has("depot") || roleSet.has("dealer")) && !roleSet.has("field") && (
                        <Mapping label={t("Stockist (Depot / Dealer)")}>
                          <DepotSelect userId={u.id} value={u.stockistId} groups={depotGroups} />
                        </Mapping>
                      )}
                      {roleSet.has("hq") && (
                        <Mapping label={t("C&F HQ")}>
                          <CnfSelect userId={u.id} value={u.cnfId} options={cnfOptions} />
                        </Mapping>
                      )}
                      {roleSet.has("khq") && <Mapping label={t("Kanpur HQ")}><Text>{t("Company-wide")}</Text></Mapping>}
                      </>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        {u.id !== admin.id ? (
                          <>
                            <ActiveToggle userId={u.id} active={u.isActive} />
                            <DeleteUserButton userId={u.id} userName={u.name} />
                          </>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>{t("you")}</span>
                        )}
                      </div>
                      <div className="mt-1 flex justify-center">
                        <EditUserButton userId={u.id} name={u.name} phone={u.phone} />
                      </div>
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

function KeyIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M17 6l2 2M14 9l2 2" />
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
