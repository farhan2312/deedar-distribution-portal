import { asc } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, depots, userAreas, userDepots, users, type AccessRole } from "@/db/schema";
import { addUser, removeUser } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { AreaCheckbox, CnfSelect, DepotCheckbox, DepotSelect, RoleCheckbox } from "./controls";

const ROLE_COLS: { role: AccessRole; label: string }[] = [
  { role: "field", label: "Field" },
  { role: "supervisor", label: "Supervisor" },
  { role: "dealer", label: "Depot" },
  { role: "hq", label: "C&F HQ" },
  { role: "khq", label: "Kanpur HQ" },
  { role: "admin", label: "Admin" },
];

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const [allUsers, allDepots, allCnfs, allAreas, allUserAreas, allUserDepots] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(depots).orderBy(asc(depots.name)),
    db.select().from(cnfs).orderBy(asc(cnfs.name)),
    db.select().from(areas).orderBy(asc(areas.name)),
    db.select().from(userAreas),
    db.select().from(userDepots),
  ]);

  const depotOptions = allDepots.map((d) => ({ id: d.id, name: d.name }));
  const cnfOptions = allCnfs.map((c) => ({ id: c.id, name: c.name }));
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
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Users &amp; access
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Central Admin adds every user and controls which sections they see in
        their sidebar. Retailer scan stays public.
      </p>

      <div className="card" style={{ padding: 18, maxWidth: 520, marginBottom: 20 }}>
        <h6 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 12px" }}>
          Add a user
        </h6>
        <form action={addUser}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
            <div className="field">
              <label>Name</label>
              <input className="inp" type="text" name="name" placeholder="Full name" required />
            </div>
            <div className="field">
              <label>Mobile (username)</label>
              <input className="inp" type="tel" name="phone" placeholder="10-digit mobile" maxLength={10} required />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 8 }} type="submit">Add user</button>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "10px 0 0" }}>
            Password is the mobile number until first login; assign access below.
          </p>
        </form>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Name</th>
              <th style={{ ...th, textAlign: "left" }}>Mobile</th>
              {ROLE_COLS.map((c) => (
                <th key={c.role} style={th}>{c.label}</th>
              ))}
              <th style={{ ...th, textAlign: "left" }}>Mapping</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => {
              const roleSet = new Set(u.accessRoles);
              const depotAreas = u.depotId ? (areasByDepot.get(u.depotId) ?? []) : [];
              return (
                <tr key={u.id}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.phone}</td>
                  {ROLE_COLS.map((c) => (
                    <td key={c.role} style={{ ...td, textAlign: "center" }}>
                      <RoleCheckbox userId={u.id} role={c.role} checked={roleSet.has(c.role)} />
                    </td>
                  ))}
                  <td style={{ ...td, minWidth: 220 }}>
                    {roleSet.has("field") && (
                      <Mapping label="Depot (Field)">
                        <DepotSelect userId={u.id} value={u.depotId} options={depotOptions} />
                        {u.depotId && depotAreas.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                            {depotAreas.map((a) => (
                              <AreaCheckbox key={a.id} userId={u.id} areaId={a.id} name={a.name} checked={userAreaSet.get(u.id)?.has(a.id) ?? false} />
                            ))}
                          </div>
                        )}
                      </Mapping>
                    )}
                    {roleSet.has("supervisor") && (
                      <Mapping label="Depots (Supervisor)">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
                    {roleSet.has("admin") && <Mapping label="Admin"><Text>Company-wide</Text></Mapping>}
                  </td>
                  <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                    {u.id !== admin.id ? (
                      <form action={removeUser.bind(null, u.id)}>
                        <button className="link" style={{ fontSize: 12, color: "var(--danger)" }} type="submit">Remove</button>
                      </form>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>you</span>
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
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{children}</div>;
}

const th: React.CSSProperties = {
  textAlign: "center",
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  padding: 10,
  borderBottom: "1px solid var(--hairline)",
};
const td: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" };
