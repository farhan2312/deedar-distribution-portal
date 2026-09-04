"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  auditActionEnum,
  auditModuleEnum,
  type AccessRole,
  type AuditAction,
  type AuditModule,
} from "@/db/schema";
import { AUDIT_TABS, TAB_ACTIONS, TAB_MODULES, type AuditTab } from "@/lib/audit/tabs";
import { AUDIT_PERIODS, type AuditPeriod } from "@/lib/audit/periods";
import type { AuditChange, AuditFilters, AuditRow } from "@/lib/audit/types";
import { deviceLabel } from "@/lib/audit/device";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { useT } from "@/lib/i18n/provider";
import { SearchInput } from "@/components/ui/search-input";
import { UrlPagination } from "@/components/ui/url-pagination";

const ACTION_STYLE: Record<AuditAction, { label: string; bg: string; color: string }> = {
  create: { label: "Create", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  update: { label: "Update", bg: "rgba(46,95,163,.12)", color: "#2E5FA3" },
  delete: { label: "Delete", bg: "rgba(199,38,59,.10)", color: "#C7263B" },
  login: { label: "Login", bg: "rgba(18,138,130,.12)", color: "#128A82" },
  login_failed: { label: "Failed login", bg: "rgba(199,38,59,.10)", color: "#C7263B" },
  logout: { label: "Logout", bg: "var(--bg-soft)", color: "var(--ink-3)" },
  password_reset: { label: "Password reset", bg: "rgba(178,94,0,.12)", color: "#B25E00" },
  approve: { label: "Approve", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  reject: { label: "Reject", bg: "rgba(199,38,59,.10)", color: "#C7263B" },
};

const MODULE_LABEL: Record<AuditModule, string> = {
  auth: "Auth",
  users: "Users",
  access: "Access",
  hierarchy: "Hierarchy",
  stockists: "Stockists",
  areas: "Areas",
  bugs: "Bugs",
};

/** Weekday rows, Monday first — a working week reads better than Sun–Sat.
 * The number is Postgres's `extract(dow)`, where Sunday is 0. */
const DOW = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

export type UsageRow = {
  id: string | null;
  name: string | null;
  phone: string | null;
  roles: AccessRole[];
  sessions: number;
  actions: number;
  activeMinutes: number;
  lastAt: Date;
};

export type AuditData = {
  last24: { logins: number; failed: number; actors: number; actions: number };
  totals: { logins: number; failed: number; actors: number; actions: number };
  byAction: { action: AuditAction; n: number }[];
  byDay: { day: string; n: number; logins: number; failed: number }[];
  heatmap: { dow: number; hour: number; n: number }[];
  byDevice: { label: string; n: number }[];
  topUsers: { id: string | null; name: string | null; phone: string | null; n: number }[];
  rows: AuditRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
};

/**
 * The audit screen: five tabs over one stream of events.
 *
 * One client component rather than a page of server sections — every part of
 * it responds to the same tab, period and filter row, and splitting it would
 * mean threading the same six params through six boundaries.
 */
export function AuditScreen({
  tab,
  period,
  filters,
  actors,
  data,
  usage,
  emptyHint,
}: {
  tab: AuditTab;
  period: AuditPeriod;
  filters: AuditFilters;
  actors: { id: string; name: string }[];
  data: AuditData;
  usage: UsageRow[];
  emptyHint: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic({
    tab,
    period,
    module: filters.module,
    action: filters.action,
    actorId: filters.actorId,
  });

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    // Any change to what is being shown resets to page 1.
    next.delete("page");
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const filtered = !!(filters.module || filters.action || filters.actorId || filters.q);
  const dim = { opacity: pending ? 0.72 : 1 };
  const nothingEver = data.totals.actions === 0 && period === "all" && !filtered;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Above the tabs, and on every one of them.
          These are a health check on the system rather than a property of
          whichever slice you happen to be reading, so they stay put — a number
          that vanishes when you change tab reads as a number that stopped
          being true. Fixed at 24h for the same reason the period filter does
          not touch them: "Failed: 0" because you were looking at last March
          would be worse than no card at all. */}
      <div className="mb-4 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Kpi label={t("Logins · 24h")} value={data.last24.logins} tint="#2E5FA3" icon={<UserIcon />} />
        <Kpi
          label={t("Failed · 24h")}
          value={data.last24.failed}
          tint="#C7263B"
          icon={<LockIcon />}
          alert={data.last24.failed > 0}
        />
        <Kpi label={t("Active users · 24h")} value={data.last24.actors} tint="#1E9E5A" icon={<UsersIcon />} />
        <Kpi label={t("Actions · 24h")} value={data.last24.actions} tint="#7B2FA0" icon={<BoltIcon />} />
      </div>

      {/* Tabs. Each is a saved filter on the same table, so the counts across
          them always reconcile. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-1 border-b"
        style={{ borderColor: "var(--hairline-soft)" }}
      >
        {AUDIT_TABS.map((x) => {
          const active = shown.tab === x.key;
          return (
            <button
              key={x.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() =>
                startTransition(() => {
                  showOptimistic({ ...shown, tab: x.key });
                  // The action/module dropdowns belong to the old tab's
                  // vocabulary — carrying them over can land on a combination
                  // with no rows and no obvious reason why.
                  push({ tab: x.key === "overall" ? null : x.key, action: null, module: null });
                })
              }
              className="relative px-3.5 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--ink-3)",
                boxShadow: active ? "inset 0 -2px 0 var(--accent)" : undefined,
              }}
            >
              {t(x.label)}
            </button>
          );
        })}
      </div>

      {/* Period — four pills, not the dashboards' date picker. A log is read by
          recency, not compared against the period before it. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 transition-opacity" style={dim}>
        {AUDIT_PERIODS.map((x) => {
          const active = shown.period === x.key;
          return (
            <button
              key={x.key}
              type="button"
              aria-pressed={active}
              onClick={() =>
                startTransition(() => {
                  showOptimistic({ ...shown, period: x.key });
                  push({ p: x.key === "7d" ? null : x.key });
                })
              }
              className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--ink-2)",
                border: `1px solid ${active ? "var(--accent)" : "var(--hairline)"}`,
                cursor: "pointer",
              }}
            >
              {t(x.label)}
            </button>
          );
        })}
      </div>

      {nothingEver ? (
        <p className="card p-6 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          {emptyHint}
        </p>
      ) : (
        <>
          {shown.tab === "overall" && <OverallTab data={data} t={t} />}
          {shown.tab === "usage" && <UsageTab rows={usage} t={t} />}

          {shown.tab !== "overall" && shown.tab !== "usage" && (
            <>
              <FilterRow
                tab={shown.tab}
                shown={shown}
                filters={filters}
                actors={actors}
                filtered={filtered}
                total={data.total}
                dim={dim}
                onPick={(patch, optimistic) =>
                  startTransition(() => {
                    showOptimistic({ ...shown, ...optimistic });
                    push(patch);
                  })
                }
                t={t}
              />
              <div className="transition-opacity" style={{ opacity: pending ? 0.6 : 1 }}>
                <ActivityTable
                  tab={shown.tab}
                  rows={data.rows}
                  page={data.page}
                  totalPages={data.totalPages}
                  t={t}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────

/** The charts. The KPI cards used to live here and now sit above the tabs,
 * since they describe the system rather than this tab. */
function OverallTab({ data, t }: { data: AuditData; t: (k: string) => string }) {
  return (
    <>
      {/* Wide plots first, the two donuts on the right of their rows: a
          proportion is read at a glance and a trend is read across, so the
          trends get the width. */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1fr_minmax(272px,330px)]">
        <Heatmap cells={data.heatmap} t={t} />
        <TrendCard days={data.byDay} t={t} />
        <BreakdownCard byAction={data.byAction} total={data.totals.actions} t={t} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_minmax(272px,330px)]">
        <LoginTrendCard days={data.byDay} t={t} />
        <DeviceCard byDevice={data.byDevice} t={t} />
      </div>

      <TopUsersCard rows={data.topUsers} t={t} />
    </>
  );
}

function UsageTab({ rows, t }: { rows: UsageRow[]; t: (k: string) => string }) {
  const totalMinutes = rows.reduce((s, r) => s + r.activeMinutes, 0);
  return (
    <>
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        {rows.length} {t(rows.length === 1 ? "user active" : "users active")} · {hhmm(totalMinutes)}{" "}
        {t("total active time")} ·{" "}
        <span title={t("First to last action each day — this app records what people do, not a heartbeat.")}>
          {t("an approximation, not a stopwatch")}
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="card p-6 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          {t("Nobody was active in this period.")}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {["User", "Role", "Active time", "Sessions", "Actions", "Last active"].map((h) => (
                  <th key={h}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? r.name}>
                  <td>
                    <span className="flex items-center gap-2">
                      <Avatar name={r.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.name ?? "—"}</span>
                        <span className="block text-[11px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                          {r.phone ?? ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {r.roles.length === 0 ? (
                        <span style={{ color: "var(--ink-3)" }}>—</span>
                      ) : (
                        r.roles.map((role) => (
                          <span
                            key={role}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                            style={{ background: "var(--bg-soft)", color: "var(--ink-2)", letterSpacing: ".04em" }}
                          >
                            {t(ROLE_LABEL[role] ?? role)}
                          </span>
                        ))
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap font-semibold tabular-nums">{hhmm(r.activeMinutes)}</td>
                  <td className="tabular-nums">{r.sessions}</td>
                  <td className="tabular-nums">{r.actions}</td>
                  <td className="whitespace-nowrap tabular-nums" style={{ color: "var(--ink-2)" }}>
                    {formatISTDate(r.lastAt)} · {formatISTTime(r.lastAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** "12h 17m", or "—" when nothing was recorded. */
function hhmm(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function FilterRow({
  tab,
  shown,
  filters,
  actors,
  filtered,
  total,
  dim,
  onPick,
  t,
}: {
  tab: AuditTab;
  shown: { module: AuditModule | null; action: AuditAction | null; actorId: string | null };
  filters: AuditFilters;
  actors: { id: string; name: string }[];
  filtered: boolean;
  total: number;
  dim: React.CSSProperties;
  onPick: (patch: Record<string, string | null>, optimistic: Record<string, unknown>) => void;
  t: (k: string) => string;
}) {
  // Only the actions and modules this tab can actually contain — offering
  // "Create" on Logins & Sessions is a filter that can only ever return zero.
  // Read from the same table the SQL filter uses, so the dropdown and the
  // query can never disagree about what a tab holds.
  const actions = TAB_ACTIONS[tab] ?? auditActionEnum.enumValues;
  const modules = TAB_MODULES[tab] ?? auditModuleEnum.enumValues;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3.5">
      {modules.length > 1 && (
        <Select
          value={shown.module ?? "all"}
          onChange={(v) => onPick({ module: v }, { module: v === "all" ? null : (v as AuditModule) })}
          aria-label={t("Module")}
          style={dim}
        >
          <option value="all">{t("All modules")}</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {t(MODULE_LABEL[m])}
            </option>
          ))}
        </Select>
      )}

      {actions.length > 1 && (
        <Select
          value={shown.action ?? "all"}
          onChange={(v) => onPick({ action: v }, { action: v === "all" ? null : (v as AuditAction) })}
          aria-label={t("Action")}
          style={dim}
        >
          <option value="all">{t("All actions")}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {t(ACTION_STYLE[a].label)}
            </option>
          ))}
        </Select>
      )}

      <Select
        value={shown.actorId ?? "all"}
        onChange={(v) => onPick({ actor: v }, { actorId: v === "all" ? null : v })}
        aria-label={t("User")}
        style={dim}
      >
        <option value="all">{t("All users")}</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>

      <SearchInput
        param="q"
        initial={filters.q}
        resetParam="page"
        style={{ padding: "6px 10px", fontSize: 12, minWidth: 220 }}
        placeholder={t("Search user, record or change…")}
      />

      {filtered && (
        <button
          type="button"
          className="link text-[12px]"
          onClick={() =>
            onPick(
              { module: null, action: null, actor: null, q: null },
              { module: null, action: null, actorId: null },
            )
          }
        >
          {t("Clear filters")}
        </button>
      )}

      <span className="ml-auto text-[12px]" style={{ color: "var(--ink-3)" }}>
        {total} {t(total === 1 ? "entry" : "entries")}
      </span>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  tint,
  icon,
  alert,
}: {
  label: string;
  value: number;
  tint: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className="card flex items-center gap-3.5 px-5 py-4"
      style={alert ? { borderColor: tint, boxShadow: `inset 3px 0 0 ${tint}` } : undefined}
    >
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-bold uppercase" style={{ letterSpacing: ".06em", color: "var(--ink-3)" }}>
          {label}
        </div>
        <div
          className="mt-0.5 text-[26px] font-bold leading-none tabular-nums"
          style={{ fontFamily: "var(--font-display)", color: alert ? tint : "var(--ink-1)" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function CardShell({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col p-5">
      <h2 className="text-[14px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {title}
      </h2>
      {sub && (
        <p className="mt-0.5 mb-3 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {sub}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Weekday x hour density.
 *
 * Hours are bucketed in threes: 24 columns at a readable cell size needs more
 * width than this card has, and "who is active before lunch" is the question
 * being asked, not "at 10:47".
 */
// ── Chart primitives ─────────────────────────────────────────────────────

/** The drawing box every line chart shares. Room on the left for the y labels
 * and under the plot for the dates, so nothing has to overlap the data. */
const PLOT = { w: 640, h: 200, l: 34, r: 10, t: 12, b: 24 };
const PLOT_NARROW = { ...PLOT, w: 460, h: 250 };

/**
 * A "nice" axis top: the next 1, 2, 5 or 10 above the peak.
 *
 * The middle gridline is half of it, so the top has to halve cleanly — a peak
 * of 9 topping out at 9 labels the middle line "4.5", which is a number nobody
 * would have chosen.
 */
function axisMax(values: number[]): number {
  const peak = Math.max(1, ...values);
  const power = Math.pow(10, Math.floor(Math.log10(peak)));
  for (const mult of [1, 2, 5, 10]) {
    if (peak <= mult * power) return mult * power;
  }
  return 10 * power;
}

type Series = { key: string; label: string; color: string; values: number[] };

/**
 * Line (and optionally area) chart over a run of days.
 *
 * Both trend cards are this component with different series, because a shared
 * y-scale, a shared hover and a shared axis are exactly the things that go
 * quietly out of sync when two charts are written twice.
 *
 * Hovering anywhere in a column lights the whole column — the hit target is
 * the column, not the 8px dot, so the tooltip is reachable without precision
 * aiming.
 */
function LineChart({
  labels,
  series,
  area,
  narrow,
  t,
}: {
  labels: string[];
  series: Series[];
  /** Fill under the first series. On for a single-series trend, off when two
   * lines share the plot and a fill would hide one of them. */
  area?: boolean;
  /** Taller box, for a chart in a third-width card. */
  narrow?: boolean;
  t: (k: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = narrow ? PLOT_NARROW : PLOT;
  // A viewBox scales everything inside it, so the same font size renders
  // smaller in the narrower box sitting in the narrower card. Text and markers
  // are pre-divided by that scale; the strokes do not need it because they are
  // non-scaling.
  const k = narrow ? 1.5 : 1;
  const n = labels.length;
  const max = axisMax(series.flatMap((s) => s.values));
  const innerW = box.w - box.l - box.r;
  const innerH = box.h - box.t - box.b;

  // A single point has no width to spread across, so it sits in the middle.
  const x = (i: number) => (n === 1 ? box.l + innerW / 2 : box.l + (i / (n - 1)) * innerW);
  const y = (v: number) => box.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];

  // Enough labels to orient, never so many that they collide.
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${box.w} ${box.h}`}
        className="block w-full"
        style={{ height: "auto", overflow: "visible" }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${series[0]?.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]?.color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={series[0]?.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid and y labels, kept recessive: they orient the eye, they are not
            the content. */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={box.l}
              x2={box.w - box.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--hairline)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text x={box.l - 8} y={y(v) + 3.5 * k} textAnchor="end" fontSize={10 * k} fill="var(--ink-3)">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {area && series[0] && n > 1 && (
          <path
            d={
              `M ${x(0)} ${y(series[0].values[0])} ` +
              series[0].values.map((v, i) => `L ${x(i)} ${y(v)}`).join(" ") +
              ` L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`
            }
            fill={`url(#fill-${series[0].key})`}
          />
        )}

        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={box.t}
            y2={box.t + innerH}
            stroke="var(--ink-3)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {series.map((s) => (
          <g key={s.key}>
            {n > 1 && (
              <path
                d={s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {s.values.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={(hover === i ? 5 : 4) * k}
                fill={s.color}
                // A 2px surface ring keeps two dots legible where the series
                // cross, instead of merging into one blob.
                stroke="var(--surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))}

        {labels.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d} x={x(i)} y={box.h - 6} textAnchor="middle" fontSize={10 * k} fill="var(--ink-3)">
              {d.slice(5)}
            </text>
          ) : null,
        )}

        {/* Hit targets: full-height columns, so the whole strip is hoverable. */}
        {labels.map((d, i) => (
          <rect
            key={`hit-${d}`}
            x={n === 1 ? box.l : x(i) - innerW / (n - 1) / 2}
            y={box.t}
            width={n === 1 ? innerW : innerW / (n - 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-2.5 py-1.5 text-[11px] shadow-md"
          style={{
            left: `${(x(hover) / box.w) * 100}%`,
            top: 0,
            transform: "translate(-50%, -8px)",
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            color: "var(--ink-1)",
            whiteSpace: "nowrap",
          }}
        >
          <div className="font-semibold">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span style={{ color: "var(--ink-2)" }}>{t(s.label)}</span>
              <b className="tabular-nums">{s.values[hover]}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Slice = { key: string; label: string; n: number; color: string };

/**
 * Donut with a readout in the hole.
 *
 * The hole is the tooltip: hovering a segment swaps the total for that
 * segment's own numbers, which avoids a floating box over a chart this small
 * and gives the hover somewhere fixed to land. Segments are separated by a
 * 2px gap in the surface colour so neighbouring steps of one ramp still read
 * as two slices.
 */
function Donut({
  slices,
  total,
  caption,
  t,
}: {
  slices: Slice[];
  total: number;
  caption: string;
  t: (k: string) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const R = 54;
  const C = 2 * Math.PI * R;
  const GAP = 2;
  const shown = hover ? slices.find((s) => s.key === hover) : null;

  // Built with a plain loop, not a closure that accumulates: the React
  // Compiler cannot prove a captured counter is safe to memoise, and it is
  // right to be suspicious — the running total is order-dependent state.
  const arcs: (Slice & { len: number; offset: number })[] = [];
  for (const slice of slices) {
    const len = total > 0 ? (slice.n / total) * C : 0;
    arcs.push({ ...slice, len, offset: arcs.reduce((sum, a) => sum + a.len, 0) });
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" className="block w-[150px] max-w-full" onMouseLeave={() => setHover(null)}>
        <g transform="translate(70,70) rotate(-90)">
          <circle r={R} fill="none" stroke="var(--chart-empty)" strokeWidth="20" />
          {arcs.map((a) => (
            <circle
              key={a.key}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={hover === a.key ? 26 : 20}
              // The gap is taken out of the drawn length, never added between
              // offsets, so the segments still sum to the full circle.
              strokeDasharray={`${Math.max(a.len - GAP, 0)} ${C - Math.max(a.len - GAP, 0)}`}
              strokeDashoffset={-a.offset}
              opacity={hover && hover !== a.key ? 0.35 : 1}
              style={{ transition: "stroke-width .12s ease, opacity .12s ease", cursor: "default" }}
              onMouseEnter={() => setHover(a.key)}
            />
          ))}
        </g>
        <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink-1)">
          {shown ? shown.n : total}
        </text>
        <text x="70" y="82" textAnchor="middle" fontSize="9.5" fill="var(--ink-3)">
          {shown
            ? `${total > 0 ? ((shown.n / total) * 100).toFixed(1) : "0"}%`
            : caption}
        </text>
      </svg>

      {/* The legend is not decoration: it is what carries identity, since the
          ramp encodes which entity a slice is and not how big it is. */}
      <div className="mt-3 flex w-full flex-col gap-1.5">
        {slices.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[12px]"
            style={{ background: hover === s.key ? "var(--bg-soft)" : "transparent" }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-1)" }} title={t(s.label)}>
              {t(s.label)}
            </span>
            <span className="flex-none tabular-nums" style={{ color: "var(--ink-2)" }}>
              <b style={{ color: "var(--ink-1)" }}>{s.n}</b>{" "}
              <span style={{ color: "var(--ink-3)" }}>
                ({total > 0 ? ((s.n / total) * 100).toFixed(1) : "0.0"}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Where each action sits on the blue ramp — fixed, so a filter that removes a
 * slice never repaints the ones that remain. Failed logins take the alert
 * colour instead: it is a state, not another category, and it is the one slice
 * that should catch the eye.
 *
 * The five actions below cover the log; the rest are folded into "Other"
 * rather than given a sixth step nobody could tell from the fifth.
 */
const ACTION_SLICE: Partial<Record<AuditAction, string>> = {
  create: "var(--chart-blue-5)",
  update: "var(--chart-blue-4)",
  delete: "var(--chart-blue-3)",
  login: "var(--chart-blue-2)",
  logout: "var(--chart-blue-1)",
  login_failed: "var(--chart-alert)",
};

const VIOLET_RAMP = [
  "var(--chart-violet-5)",
  "var(--chart-violet-4)",
  "var(--chart-violet-3)",
  "var(--chart-violet-2)",
  "var(--chart-violet-1)",
];

// ── Cards ────────────────────────────────────────────────────────────────

function Heatmap({ cells, t }: { cells: { dow: number; hour: number; n: number }[]; t: (k: string) => string }) {
  const [hover, setHover] = useState<{ dow: number; b: number; n: number } | null>(null);
  const buckets = [0, 3, 6, 9, 12, 15, 18, 21];
  const grid = new Map<string, number>();
  for (const c of cells) {
    const b = Math.floor(c.hour / 3) * 3;
    const key = `${c.dow}:${b}`;
    grid.set(key, (grid.get(key) ?? 0) + c.n);
  }
  const max = Math.max(1, ...grid.values());
  const RAMP = [
    "var(--chart-blue-1)",
    "var(--chart-blue-2)",
    "var(--chart-blue-3)",
    "var(--chart-blue-4)",
    "var(--chart-blue-5)",
  ];
  // Five steps by share of the busiest cell. A single scale for the whole grid
  // is what makes two cells comparable at a glance.
  const step = (n: number) => (n === 0 ? -1 : Math.min(4, Math.floor((n / max) * 5 - 0.0001)));

  return (
    <CardShell title={t("Activity heatmap")} sub={t("By weekday and time of day")}>
      <div className="flex flex-1 flex-col gap-[3px]">
        <div className="flex gap-[3px] pl-9">
          {buckets.map((b) => (
            <span key={b} className="flex-1 text-center text-[9px] tabular-nums" style={{ color: "var(--ink-3)" }}>
              {String(b).padStart(2, "0")}
            </span>
          ))}
        </div>
        {DOW.map((d) => (
          <div key={d.dow} className="flex flex-1 items-center gap-[3px]">
            <span className="w-8 flex-none text-[10px] font-semibold" style={{ color: "var(--ink-3)" }}>
              {t(d.label)}
            </span>
            {buckets.map((b) => {
              const n = grid.get(`${d.dow}:${b}`) ?? 0;
              const s = step(n);
              const on = hover?.dow === d.dow && hover?.b === b;
              return (
                <span
                  key={b}
                  className="h-full min-h-[22px] flex-1 rounded-[5px]"
                  style={{
                    background: s < 0 ? "var(--chart-empty)" : RAMP[s],
                    outline: on ? "2px solid var(--ink-1)" : "none",
                    outlineOffset: "1px",
                    transition: "outline-color .1s ease",
                  }}
                  onMouseEnter={() => setHover({ dow: d.dow, b, n })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* A fixed readout line rather than a floating tooltip: the grid is dense
          and a box over it would cover the cells either side of the one you
          are asking about. */}
      <div className="mt-3 flex items-center justify-between gap-3 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        <span className="truncate" style={{ color: hover ? "var(--ink-1)" : "var(--ink-3)" }}>
          {hover
            ? `${t(DOW.find((d) => d.dow === hover.dow)?.label ?? "")} ${String(hover.b).padStart(2, "0")}:00–${String(
                hover.b + 3,
              ).padStart(2, "0")}:00 · ${hover.n}`
            : t("Hover a cell for the count")}
        </span>
        <span className="flex flex-none items-center gap-1">
          {t("Less")}
          {RAMP.map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
          ))}
          {t("More")}
        </span>
      </div>
    </CardShell>
  );
}

function TrendCard({ days, t }: { days: AuditData["byDay"]; t: (k: string) => string }) {
  return (
    <CardShell title={t("Daily activity trend")} sub={t("Actions recorded per day")}>
      {days.length === 0 ? (
        <Empty t={t} />
      ) : (
        <LineChart
          labels={days.map((d) => d.day)}
          series={[
            { key: "actions", label: "Actions", color: "var(--chart-line)", values: days.map((d) => d.n) },
          ]}
          area
          narrow
          t={t}
        />
      )}
    </CardShell>
  );
}

function LoginTrendCard({ days, t }: { days: AuditData["byDay"]; t: (k: string) => string }) {
  return (
    <CardShell title={t("Login vs failed login trend")} sub={t("Per day, over the selected period")}>
      {days.length === 0 ? (
        <Empty t={t} />
      ) : (
        <>
          <div className="mb-1 flex items-center gap-4 text-[11px]" style={{ color: "var(--ink-2)" }}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-line)" }} />
              {t("Logins")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-alert)" }} />
              {t("Failed logins")}
            </span>
          </div>
          <LineChart
            labels={days.map((d) => d.day)}
            series={[
              { key: "logins", label: "Logins", color: "var(--chart-line)", values: days.map((d) => d.logins) },
              { key: "failed", label: "Failed logins", color: "var(--chart-alert)", values: days.map((d) => d.failed) },
            ]}
            t={t}
          />
        </>
      )}
    </CardShell>
  );
}

function BreakdownCard({
  byAction,
  total,
  t,
}: {
  byAction: AuditData["byAction"];
  total: number;
  t: (k: string) => string;
}) {
  // Named slices keep their fixed colour; everything else becomes one grey
  // "Other" rather than a step nobody could distinguish.
  const named = byAction.filter((a) => ACTION_SLICE[a.action]);
  const rest = byAction.filter((a) => !ACTION_SLICE[a.action]).reduce((s, a) => s + a.n, 0);
  const slices: Slice[] = named.map((a) => ({
    key: a.action,
    label: ACTION_STYLE[a.action].label,
    n: a.n,
    color: ACTION_SLICE[a.action]!,
  }));
  if (rest > 0) slices.push({ key: "other", label: "Other", n: rest, color: "var(--chart-other)" });

  return (
    <CardShell title={t("Action breakdown")} sub={`${total} ${t("actions")}`}>
      {slices.length === 0 ? (
        <Empty t={t} />
      ) : (
        <Donut slices={slices} total={total} caption={t("Total actions")} t={t} />
      )}
    </CardShell>
  );
}

function DeviceCard({ byDevice, t }: { byDevice: AuditData["byDevice"]; t: (k: string) => string }) {
  const total = byDevice.reduce((s, d) => s + d.n, 0);
  // Colour follows the device name, not its size: the ramp step comes from
  // alphabetical position, so a busier week cannot swap two devices' colours.
  const order = [...byDevice].map((d) => d.label).sort((a, b) => a.localeCompare(b));
  const top = byDevice.slice(0, 5);
  const rest = byDevice.slice(5).reduce((s, d) => s + d.n, 0);
  const slices: Slice[] = top.map((d) => ({
    key: d.label,
    label: d.label,
    n: d.n,
    color: VIOLET_RAMP[order.indexOf(d.label) % VIOLET_RAMP.length],
  }));
  if (rest > 0) slices.push({ key: "other", label: "Other", n: rest, color: "var(--chart-other)" });

  return (
    <CardShell title={t("Device breakdown")} sub={t("Browser and OS, from the user agent")}>
      {slices.length === 0 ? (
        <Empty t={t} />
      ) : (
        <Donut slices={slices} total={total} caption={t("Total actions")} t={t} />
      )}
    </CardShell>
  );
}

function TopUsersCard({ rows, t }: { rows: AuditData["topUsers"]; t: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <CardShell title={t("Top users by activity")} sub={t("Actions in the selected period")}>
      {rows.length === 0 ? (
        <Empty t={t} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.id ?? r.name} className="flex items-center gap-3">
              <Avatar name={r.name} />
              <span className="w-[140px] flex-none truncate text-[12.5px]" style={{ color: "var(--ink-1)" }} title={r.name ?? ""}>
                {r.name ?? "—"}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
                <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: "var(--accent)" }} />
              </div>
              <span className="w-10 flex-none text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>
                {r.n}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

/**
 * The log itself, shared by the three table tabs.
 *
 * Logins & Sessions drops two columns. On that tab every row is module "Auth"
 * and no row carries a field diff, so both cells were a constant and a dash —
 * width spent on nothing, and a "Changes" header that reads as if the data
 * were missing rather than inapplicable.
 */
function ActivityTable({
  tab,
  rows,
  page,
  totalPages,
  t,
}: {
  tab: AuditTab;
  rows: AuditRow[];
  page: number;
  totalPages: number;
  t: (k: string) => string;
}) {
  const isLogins = tab === "logins";
  const columns = isLogins
    ? ["Date & time", "User", "Action", "Record", "IP address", "Device"]
    : ["Date & time", "User", "Action", "Module", "Record", "Changes", "IP address", "Device"];

  return (
    <section className="card flex flex-col overflow-hidden p-0">
      <div className="flex flex-none items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline-soft)" }}>
        <h2 className="text-[14px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {t("Audit activity")}
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {t("No entries match — try clearing the filter.")}
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: isLogins ? 760 : 980 }}>
              <thead>
                <tr>
                  {columns.map((h) => (
                    <th key={h}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = ACTION_STYLE[r.action];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap tabular-nums">
                        {formatISTDate(r.createdAt)}
                        <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                          {formatISTTime(r.createdAt)}
                        </div>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Avatar name={r.actorName} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.actorName ?? "—"}</span>
                            <span className="block text-[11px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                              {r.actorPhone ?? ""}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                          {t(st.label)}
                        </span>
                      </td>
                      {!isLogins && <td>{t(MODULE_LABEL[r.module])}</td>}
                      <td>
                        <span className="font-semibold">{r.entityLabel ?? "—"}</span>
                        {r.summary && (
                          <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                            {r.summary}
                          </div>
                        )}
                      </td>
                      {!isLogins && (
                        <td>
                          <ChangesCell changes={r.changes} t={t} />
                        </td>
                      )}
                      <td className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                        <IpCell ip={r.ip} t={t} />
                      </td>
                      <td style={{ color: "var(--ink-3)" }}>{deviceLabel(r.userAgent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-5 pb-3">
              <UrlPagination page={page} totalPages={totalPages} param="page" />
            </div>
          )}
        </>
      )}
    </section>
  );
}

const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * The caller's address, in full.
 *
 * The public address leads and gets the emphasis; the hops behind it — a
 * proxy, or the loopback a development request actually arrived on — are
 * printed underneath rather than dropped, because "which route did this reach
 * us by" is a question the log should be able to answer. Loopback is spelled
 * out, since `::1` on its own reads like a truncated value when it is in fact
 * a complete address.
 */
function IpCell({ ip, t }: { ip: string | null; t: (k: string) => string }) {
  if (!ip) return <span>—</span>;
  const [client, ...hops] = ip.split(",").map((s) => s.trim());
  return (
    <span className="block">
      <span className="block whitespace-nowrap">{client}</span>
      {LOOPBACK.has(client) && (
        <span className="block text-[11px]" style={{ color: "var(--ink-3)" }}>
          {t("localhost")}
        </span>
      )}
      {hops.length > 0 && (
        <span className="block text-[11px]" style={{ color: "var(--ink-3)" }}>
          {t("via")} {hops.map((h) => (LOOPBACK.has(h) ? `${h} (${t("localhost")})` : h)).join(" → ")}
        </span>
      )}
    </span>
  );
}

/** The field-level diff, behind a toggle: most rows have none, and the ones
 * that do would otherwise make every row three lines tall. */
function ChangesCell({ changes, t }: { changes: AuditChange[] | null; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  if (!changes || changes.length === 0) {
    return <span style={{ color: "var(--ink-3)" }}>—</span>;
  }
  return (
    <div>
      <button type="button" className="link text-[11.5px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {changes.length} {t(changes.length === 1 ? "field" : "fields")}
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1">
          {changes.map((c, i) => (
            <li key={i} className="text-[11px]" style={{ color: "var(--ink-2)" }}>
              <b>{c.field}:</b>{" "}
              <span style={{ color: "var(--ink-3)", textDecoration: "line-through" }}>{c.from ?? "—"}</span>{" "}
              → <span>{c.to ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────

function Empty({ t }: { t: (k: string) => string }) {
  return (
    <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
      {t("Nothing in this period.")}
    </p>
  );
}

function Avatar({ name }: { name: string | null }) {
  const initials =
    (name ?? "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10.5px] font-bold text-white"
      style={{ background: "var(--accent)" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Select({
  value,
  onChange,
  children,
  style,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  "aria-label": string;
}) {
  return (
    <select
      className="inp transition-opacity"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12, ...style }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {children}
    </select>
  );
}


// ── Icons ────────────────────────────────────────────────────────────────

const ico = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function UserIcon() {
  return (
    <svg {...ico}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg {...ico}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M18 20a5 5 0 0 0-2-4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg {...ico}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg {...ico}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}
