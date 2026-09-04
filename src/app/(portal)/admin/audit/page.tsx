import { requireAdmin } from "@/lib/admin/guard";
import {
  allUserOptions,
  getAuditData,
  getUsage,
  isAction,
  isModule,
  isTab,
  type AuditFilters,
  type AuditParams,
} from "@/lib/audit/data";
import { auditWindow, isAuditPeriod } from "@/lib/audit/periods";
import { getT } from "@/lib/i18n/server";
import { AuditScreen } from "./audit-screen";

/**
 * Audit Log — who changed what, and when.
 *
 * Five tabs over one table: the log is a single stream, and each tab is a
 * saved filter on it rather than a different source. That keeps the counts
 * consistent — the number on "Logins & Sessions" is the same number the
 * Overall chart draws.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const sp = await searchParams;

  const tab = isTab(sp.tab) ? sp.tab : "overall";
  // 7 days is the default: long enough to cover a working week, short enough
  // that the charts say something.
  const period = isAuditPeriod(sp.p) ? sp.p : "7d";
  const window = auditWindow(period);

  const filters: AuditFilters = {
    module: isModule(sp.module) ? sp.module : null,
    action: isAction(sp.action) ? sp.action : null,
    actorId: sp.actor && sp.actor !== "all" ? sp.actor : null,
    q: (sp.q ?? "").trim(),
  };

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [data, usage, userOptions] = await Promise.all([
    getAuditData(window, filters, page, tab),
    // Only the tab that renders it pays for it.
    tab === "usage" ? getUsage(window) : Promise.resolve([]),
    allUserOptions(),
  ]);

  // Everyone who exists, plus anyone in the log who no longer does — a filter
  // that only offers current users can't answer "what did the account we
  // deleted last week do".
  const names = new Map(userOptions.map((u) => [u.id, u.name]));
  for (const a of data.actorOptions) {
    if (a.id && !names.has(a.id)) names.set(a.id, a.name ?? "—");
  }
  const actors = [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AuditScreen
      tab={tab}
      period={period}
      filters={filters}
      actors={actors}
      data={data}
      usage={usage}
      emptyHint={t(
        "Nothing has been recorded yet. The log fills as people sign in and admins make changes.",
      )}
    />
  );
}
