import { db } from "@/db";
import { areas, cnfs, stockists, userAreas, userStockists, users, type AccessRole } from "@/db/schema";
import {
  addUser,
  removeUser,
  setUserCnf,
  setUserDepot,
  toggleAccessRole,
  toggleUserArea,
  toggleUserDepot,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import { NAV_SECTIONS } from "@/lib/portal/nav";
import { DeleteButton, SaveSelectForm, ToggleChip } from "../_components/controls";

const ROLE_ORDER: AccessRole[] = ["field", "supervisor", "depot", "hq", "khq", "admin"];
const ROLE_LABEL: Record<AccessRole, string> = {
  field: "Field",
  supervisor: "Supervisor",
  dealer: "Dealer",
  hq: "C&F HQ",
  khq: "Kanpur HQ",
  admin: "Admin",
};
const ROLE_THEME = Object.fromEntries(NAV_SECTIONS.map((s) => [s.role, s.theme])) as Record<
  AccessRole,
  { color: string; bg: string; dot: string }
>;

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const [allUsers, allStockists, allCnfs, allAreas, allUserAreas, allUserDepots] =
    await Promise.all([
      db.select().from(users),
      db.select().from(stockists),
      db.select().from(cnfs),
      db.select().from(areas),
      db.select().from(userAreas),
      db.select().from(userStockists),
    ]);

  const areasByDepot = new Map<string, typeof allAreas>();
  for (const a of allAreas) {
    areasByDepot.set(a.stockistId, [...(areasByDepot.get(a.stockistId) ?? []), a]);
  }

  const userAreaIds = new Map<string, Set<string>>();
  for (const ua of allUserAreas) {
    if (!userAreaIds.has(ua.userId)) userAreaIds.set(ua.userId, new Set());
    userAreaIds.get(ua.userId)!.add(ua.areaId);
  }

  const userDepotIds = new Map<string, Set<string>>();
  for (const ud of allUserDepots) {
    if (!userDepotIds.has(ud.userId)) userDepotIds.set(ud.userId, new Set());
    userDepotIds.get(ud.userId)!.add(ud.stockistId);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-[#0d3b2e]">Users &amp; access</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Grant roles, then map each role to its scope in the org hierarchy.
      </p>

      <div className="mt-6 space-y-4">
        {allUsers.map((u) => {
          const hasField = u.accessRoles.includes("field");
          const hasSupervisor = u.accessRoles.includes("supervisor");
          const hasDealer = u.accessRoles.includes("depot");
          const hasHq = u.accessRoles.includes("hq");
          const hasKhq = u.accessRoles.includes("khq");
          const hasAdmin = u.accessRoles.includes("admin");
          const needsDepot = hasField || hasDealer;
          const depotAreas = u.stockistId ? (areasByDepot.get(u.stockistId) ?? []) : [];

          return (
            <div key={u.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-[#0d3b2e]">{u.name}</div>
                  <div className="text-xs text-zinc-500">{u.phone}</div>
                </div>
                {u.id !== admin.id && (
                  <DeleteButton action={removeUser.bind(null, u.id)} label={u.name} />
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {ROLE_ORDER.map((role) => (
                  <ToggleChip
                    key={role}
                    action={toggleAccessRole.bind(null, u.id, role)}
                    label={ROLE_LABEL[role]}
                    active={u.accessRoles.includes(role)}
                    color={ROLE_THEME[role].color}
                    bg={ROLE_THEME[role].bg}
                  />
                ))}
              </div>

              {(needsDepot || hasSupervisor || hasHq || hasKhq || hasAdmin) && (
                <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-3 text-sm">
                  {needsDepot && (
                    <ScopeRow label="Depot">
                      <SaveSelectForm
                        action={setUserDepot.bind(null, u.id)}
                        fieldName="depotId"
                        value={u.stockistId}
                        options={allStockists}
                        placeholder="Select depot"
                      />
                    </ScopeRow>
                  )}

                  {hasField && (
                    <ScopeRow label="Areas">
                      {!u.stockistId ? (
                        <span className="text-xs text-zinc-400">Pick a depot first</span>
                      ) : depotAreas.length === 0 ? (
                        <span className="text-xs text-zinc-400">No areas in this depot yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {depotAreas.map((a) => (
                            <ToggleChip
                              key={a.id}
                              action={toggleUserArea.bind(null, u.id, a.id)}
                              label={a.name}
                              active={userAreaIds.get(u.id)?.has(a.id) ?? false}
                              color={ROLE_THEME.field.color}
                              bg={ROLE_THEME.field.bg}
                            />
                          ))}
                        </div>
                      )}
                    </ScopeRow>
                  )}

                  {hasSupervisor && (
                    <ScopeRow label="Supervises">
                      {allStockists.length === 0 ? (
                        <span className="text-xs text-zinc-400">No stockists yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {allStockists.map((d) => (
                            <ToggleChip
                              key={d.id}
                              action={toggleUserDepot.bind(null, u.id, d.id)}
                              label={d.name}
                              active={userDepotIds.get(u.id)?.has(d.id) ?? false}
                              color={ROLE_THEME.supervisor.color}
                              bg={ROLE_THEME.supervisor.bg}
                            />
                          ))}
                        </div>
                      )}
                    </ScopeRow>
                  )}

                  {hasHq && (
                    <ScopeRow label="C&F HQ">
                      <SaveSelectForm
                        action={setUserCnf.bind(null, u.id)}
                        fieldName="cnfId"
                        value={u.cnfId}
                        options={allCnfs}
                        placeholder="Select C&F HQ"
                      />
                    </ScopeRow>
                  )}

                  {hasKhq && (
                    <ScopeRow label="Kanpur HQ">
                      <span className="text-xs text-zinc-500">Company-wide</span>
                    </ScopeRow>
                  )}

                  {hasAdmin && (
                    <ScopeRow label="Admin">
                      <span className="text-xs text-zinc-500">Company-wide</span>
                    </ScopeRow>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Add user
        </div>
        <form action={addUser} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="name"
            placeholder="Full name"
            required
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0d3b2e]"
          />
          <input
            type="tel"
            name="phone"
            placeholder="10-digit mobile"
            maxLength={10}
            required
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0d3b2e]"
          />
          <button
            type="submit"
            className="rounded-md bg-[#0d3b2e] px-4 py-2 text-sm font-semibold text-white"
          >
            Add user
          </button>
        </form>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          First login password is the phone number itself.
        </p>
      </div>
    </div>
  );
}

function ScopeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 flex-none text-xs font-semibold text-zinc-500">{label}</span>
      {children}
    </div>
  );
}
