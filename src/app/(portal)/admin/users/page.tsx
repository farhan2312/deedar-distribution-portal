import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  stockists,
  passwordResetRequests,
  users,
  type AccessRole,
} from "@/db/schema";
import { dismissPasswordReset } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import {
  fetchAssignmentsFor,
  fetchDeactivatedUsers,
  fetchSupervisorOptions,
  fetchUsersPage,
  type DeactivatedUser,
  type UsersListParams,
} from "@/lib/admin/users-list";
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

/** The role checkbox columns, in the order they appear in the users table. */
const ROLE_COLS: { role: AccessRole; label: string }[] = [
  { role: "field", label: "Field ISR" },
  { role: "supervisor", label: "Sales Officer" },
  { role: "depot", label: "Depot" },
  { role: "dealer", label: "Dealer" },
  { role: "hq", label: "C&F HQ" },
  { role: "khq", label: "Kanpur HQ" },
  { role: "admin", label: "Admin" },
];

/** Deactivated rows visible before the panel scrolls, and the height of one.
 * Half a row is left showing, which is what tells a reader there is more below
 * without a caption saying so. */
const DEACTIVATED_VISIBLE = 5;
const DEACTIVATED_ROW_HEIGHT = 53;

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

  const [
    allStockists,
    allCnfs,
    allAreas,
    supervisorOptions,
    resetRows,
  ] = await Promise.all([
    db.select().from(stockists).orderBy(asc(stockists.name)),
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
    // The whole roster, not just this page — a rep on page 1 can report to a
    // supervisor on page 3.
    fetchSupervisorOptions(),
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
  const cnfIds = allCnfs.map((c) => c.id);
  const [list, deactivated] = await Promise.all([
    fetchUsersPage(params, cnfIds),
    // Same search and C&F filter as the table above: a disabled account has
    // nowhere else to appear, so the search has to reach it here.
    fetchDeactivatedUsers(params, cnfIds),
  ]);
  const pageUsers = list.rows;
  const { areasByUser: userAreaSet, stockistsByUser: userDepotSet } =
    await fetchAssignmentsFor(pageUsers.map((u) => u.id));

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
      </div>

      {/* Add user + Access requests */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <SectionHead icon={<UserPlusIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />} title={t("Add a user")} />
          <AddUserForm />
        </div>

        {/* Password reset requests — raised from the login page's "Forgot
            password?" link. There is no email or SMS channel in this app, so an
            admin actioning it here IS the verification step. */}
        <div className="card p-6">
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
      </div>

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
                  // Every row here can sign in — the deactivated ones live in
                  // their own panel below.
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-bold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                          {initials(u.name)}
                        </span>
                        <div>
                          <div className="font-semibold whitespace-nowrap" style={{ color: "var(--ink-1)" }}>{u.name}</div>
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(30,158,90,.12)", color: "#1E9E5A" }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1E9E5A" }} />
                            {t("Active")}
                          </span>
                          {/* Under the name rather than in a column of its own:
                              the table already carries seven role checkboxes,
                              and this is provenance you check occasionally, not
                              a field you scan down. */}
                          <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                            {t("Added")} {formatISTDate(u.createdAt)}
                            {u.createdByName ? ` · ${t("by")} ${u.createdByName}` : ""}
                          </div>
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
                            <ActiveToggle userId={u.id} active />
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

      <DeactivatedPanel
        rows={deactivated.rows}
        total={deactivated.total}
        query={list.filters.q}
        t={t}
      />
    </div>
  );
}

/**
 * Accounts that cannot sign in, kept out of the working list above.
 *
 * Four columns and one button, because that is the whole of what you do with a
 * disabled account: see who it was, and let them back in. No role checkboxes,
 * no mapping, no password reset — none of it applies to someone who cannot
 * reach a login screen.
 *
 * There is deliberately no Delete here. An admin deactivates rather than
 * deletes precisely BECAUSE the account has history worth keeping, so offering
 * the irreversible button next to it invites the one mistake this panel exists
 * to prevent. Deleting is still possible — activate the account and it returns
 * to the list above, where Delete comes with its impact warning.
 */
function DeactivatedPanel({
  rows,
  total,
  query,
  t,
}: {
  rows: DeactivatedUser[];
  total: number;
  query: string;
  t: (k: string) => string;
}) {
  // Nothing to say when nobody is deactivated — and when a search matches none
  // of them, the absence is the answer.
  if (total === 0) return null;

  const scrolls = rows.length > DEACTIVATED_VISIBLE;
  const th: React.CSSProperties = {
    // The tr's background does not travel with a sticky cell, so each header
    // cell carries its own — otherwise rows scroll through the header.
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "var(--bg-soft)",
  };

  return (
    <section className="card mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3.5 border-b p-5" style={{ borderColor: "var(--hairline-soft)" }}>
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl" style={{ background: "var(--bg-soft)" }}>
          <UsersIcon className="h-5 w-5" style={{ color: "var(--ink-3)" }} />
        </span>
        <div>
          <div className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Deactivated")} ({total})
          </div>
          <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {query
              ? t("Matching your search. These accounts cannot sign in.")
              : t("These accounts cannot sign in. Their visits, day logs and counters stay in the system.")}
          </div>
        </div>
      </div>

      <div
        className="overflow-x-auto"
        style={
          scrolls
            ? { maxHeight: DEACTIVATED_ROW_HEIGHT * (DEACTIVATED_VISIBLE + 0.5), overflowY: "auto" }
            : undefined
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th style={th}>{t("User")}</th>
              <th style={th}>{t("Mobile")}</th>
              <th style={th}>{t("Role")}</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[12px] font-bold" style={{ background: "var(--bg-soft)", color: "var(--ink-3)" }}>
                      {initials(u.name)}
                    </span>
                    <span className="font-semibold whitespace-nowrap" style={{ color: "var(--ink-2)" }}>{u.name}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap tabular-nums" style={{ color: "var(--ink-2)" }}>{u.phone}</td>
                <td>
                  <span className="flex flex-wrap gap-1">
                    {u.accessRoles.length === 0 ? (
                      <span style={{ color: "var(--ink-3)" }}>—</span>
                    ) : (
                      u.accessRoles.map((role) => (
                        <span
                          key={role}
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: "var(--bg-soft)", color: "var(--ink-2)", letterSpacing: ".04em" }}
                        >
                          {t(ROLE_COLS.find((c) => c.role === role)?.label ?? role)}
                        </span>
                      ))
                    )}
                  </span>
                </td>
                <td className="text-right">
                  <ActiveToggle userId={u.id} active={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > rows.length && (
        <div className="border-t px-5 py-3 text-[12px]" style={{ borderColor: "var(--hairline-soft)", color: "var(--ink-3)" }}>
          {t("Showing the first")} {rows.length} {t("of")} {total} — {t("search by name or mobile to find a specific account.")}
        </div>
      )}
    </section>
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
