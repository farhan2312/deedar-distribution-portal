import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, areas, cnfs, depots, userAreas, userDepots, users, type AccessRole } from "@/db/schema";
import { addUser, approveAccessRequest, rejectAccessRequest, removeUser } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { AreaCheckbox, CnfSelect, DepotCheckbox, DepotSelect, RoleCheckbox, SupervisorSelect } from "./controls";

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

  const depotOptions = allDepots.map((d) => ({ id: d.id, name: d.name }));
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

  return (
    <div>
      <h4 className="page-title">Users &amp; access</h4>
      <p className="page-subtitle mb-5">
        Central Admin adds every user and controls which sections they see in
        their sidebar. Retailer scan stays public.
      </p>

      <div className="card mx-auto mb-6 max-w-lg p-5">
        <h6 className="mb-3 text-[14px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Add a user
        </h6>
        <form action={addUser}>
          <div className="mb-1.5 grid grid-cols-2 gap-3">
            <div className="field">
              <label>Name</label>
              <input className="inp" type="text" name="name" placeholder="Full name" required />
            </div>
            <div className="field">
              <label>Mobile (username)</label>
              <input className="inp" type="tel" name="phone" placeholder="10-digit mobile" maxLength={10} required />
            </div>
          </div>
          <button className="btn btn-primary mt-2" type="submit">Add user</button>
          <p className="mt-2.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
            Password is the mobile number until first login; assign access below.
          </p>
        </form>
      </div>

      <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
        Access requests — pending ({pendingRequests.length})
      </h6>
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        Submitted via &ldquo;Request Access&rdquo; on the login page. Approve to
        create their account with the requested role and password they set;
        map depot/C&amp;F/reports-to below afterward.
      </p>
      {pendingRequests.length === 0 ? (
        <p className="mb-8 text-[13px]" style={{ color: "var(--ink-3)" }}>No pending requests.</p>
      ) : (
        <div className="table-wrap mb-8">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Requested role</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold whitespace-nowrap">{r.name}</td>
                  <td className="whitespace-nowrap">{r.phone}</td>
                  <td>{ROLE_LABEL[r.requestedRole]}</td>
                  <td className="whitespace-nowrap">
                    {formatISTDate(r.createdAt)} · {formatISTTime(r.createdAt)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <form action={approveAccessRequest.bind(null, r.id)} className="inline">
                      <button className="btn btn-primary btn-sm mr-2" type="submit">Approve</button>
                    </form>
                    <form action={rejectAccessRequest.bind(null, r.id)} className="inline">
                      <button className="link link-danger" type="submit">Reject</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decidedRequests.length > 0 && (
        <details className="mb-8">
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

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 960 }}>
          <thead>
            <tr>
              <th>Name</th>
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
                <tr key={u.id}>
                  <td className="font-semibold whitespace-nowrap">{u.name}</td>
                  <td className="whitespace-nowrap">{u.phone}</td>
                  {ROLE_COLS.map((c) => (
                    <td key={c.role} className="text-center">
                      <RoleCheckbox userId={u.id} role={c.role} checked={roleSet.has(c.role)} />
                    </td>
                  ))}
                  <td style={{ minWidth: 220 }}>
                    {roleSet.has("admin") ? (
                      <Mapping label="Admin">
                        <Text>Full access — every section. No depot / C&amp;F / area needed.</Text>
                      </Mapping>
                    ) : (
                    <>
                    {roleSet.has("field") && (
                      <>
                        <Mapping label="Depot (Field ISR)">
                          <DepotSelect userId={u.id} value={u.depotId} options={depotOptions} />
                          {u.depotId && depotAreas.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
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
                        <div className="flex flex-wrap gap-1">
                          {allDepots.map((d) => (
                            <DepotCheckbox key={d.id} userId={u.id} depotId={d.id} name={d.name} checked={userDepotSet.get(u.id)?.has(d.id) ?? false} />
                          ))}
                        </div>
                      </Mapping>
                    )}
                    {roleSet.has("dealer") && !roleSet.has("field") && (
                      <Mapping label="Depot (Dealer)">
                        <DepotSelect userId={u.id} value={u.depotId} options={depotOptions} />
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
                  <td className="text-center whitespace-nowrap">
                    {u.id !== admin.id ? (
                      <form action={removeUser.bind(null, u.id)}>
                        <button className="link link-danger" type="submit">Remove</button>
                      </form>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>you</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mapping({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{label}</div>
      {children}
    </div>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px]" style={{ color: "var(--ink-2)" }}>{children}</div>;
}
