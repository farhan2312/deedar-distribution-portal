import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTDate, istDayBounds, istDateString } from "@/lib/date";
import {
  getCountersVisitedToday,
  getScopeStockists,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  pickStockist,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { Donut, type DonutSegment } from "@/components/ui/donut";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";
import { DayPicker } from "../_components/day-picker";
import { RefreshButton } from "../_components/refresh-button";
import { AreaLeaderboard } from "../_components/area-leaderboard";
import { RepLeaderboard } from "../_components/rep-leaderboard";


/** Rep rows visible before the list scrolls (each row ≈ 74px + border). */
const REP_ROWS_VISIBLE = 5;

function delta(cur: number, prev: number): { pct: number | null; isNew: boolean } {
  if (prev === 0) return { pct: null, isNew: cur > 0 };
  return { pct: Math.round(((cur - prev) / prev) * 100), isNew: false };
}

/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

/** The screen offers exactly three days, so anything else in the URL — a
 * stale bookmark, a hand-typed date — falls back to today rather than
 * rendering a day none of the controls can select. */
function normalizeDate(s: string | undefined, allowed: string[]): string {
  return s && allowed.includes(s) ? s : allowed[0];
}

/** Midday UTC anchor for an IST date string — safe to add/subtract days from
 * without an off-by-one at the timezone edge. */
function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

function shiftDays(dateStr: string, days: number): string {
  return istDateString(new Date(anchor(dateStr).getTime() + days * 24 * 60 * 60 * 1000));
}

/** "Aug 6" style short label for the trend x-axis. */
function shortDayLabel(dateStr: string): string {
  return anchor(dateStr).toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  });
}

export default async function SupervisorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("Analytics")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const { depot: requestedDepot, date: requestedDate } = await searchParams;
  const stockists = await getScopeStockists(user);
  const depot = pickStockist(stockists, requestedDepot);
  const stockistIds = depot ? [depot.id] : stockists.map((d) => d.id);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);

  // ── Selected day (defaults to today) and its comparison day ─────────────
  const now = nowInstant();
  const todayStr = istDateString(now);
  // The only three days this screen offers, newest first. Also the window the
  // per-rep history panel covers, so the filter and the drill-down describe
  // the same stretch of time.
  const DAY_LABELS = ["Today", "Yesterday", "Day before yesterday"];
  const dayWindow = DAY_LABELS.map((label, i) => ({
    value: shiftDays(todayStr, -i),
    label,
  }));
  const dayOptions = dayWindow.map((d) => ({
    value: d.value,
    // Both the word and the date: "Yesterday" alone makes an SO work out which
    // day they are looking at, and a bare date makes them work out how recent
    // it is. Cheap to show both.
    label: `${t(d.label)} · ${shortDayLabel(d.value)}`,
  }));
  const dayStr = normalizeDate(requestedDate, dayWindow.map((d) => d.value));
  const isToday = dayStr === todayStr;
  const bounds = istDayBounds(anchor(dayStr));
  const prevStr = shiftDays(dayStr, -1);
  const prevBounds = istDayBounds(anchor(prevStr));

  const [
    dayLogs,
    visitMap,
    covered,
    areaRows,
    prevVisitMap,
    prevCovered,
    prevDayLogs,
    visitsPerArea,
    repDayTotals,
  ] = await Promise.all([
    getTeamDayLogs(repIds, dayStr),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    stockistIds.length
      ? db
          .select({ area: areas.name, status: counters.status })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.stockistId, stockistIds))
      : Promise.resolve([] as Array<{ area: string; status: "active" | "dormant" | "declining" }>),
    getVisitsToday(repIds, prevBounds),
    getCountersVisitedToday(repIds, prevBounds),
    getTeamDayLogs(repIds, prevStr),
    repIds.length && stockistIds.length
      ? db
          .select({ area: areas.name, n: sql<number>`count(*)::int` })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)))
          .groupBy(areas.name)
      : Promise.resolve([] as Array<{ area: string; n: number }>),
    // Packets sold per rep on the SELECTED day — the leaderboard ranks on
    // this, so it is aggregated in SQL rather than derived from the visit list
    // `getVisitsToday` returns.
    repIds.length
      ? db
          .select({
            userId: visits.userId,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            stock: sql<number>`coalesce(sum(${visits.stock}), 0)::int`,
          })
          .from(visits)
          .where(and(inArray(visits.userId, repIds), gte(visits.visitedAt, bounds.start), lt(visits.visitedAt, bounds.end)))
          .groupBy(visits.userId)
      : Promise.resolve([] as Array<{ userId: string; packets: number; stock: number }>)

  ]);

  // ── Roster status ───────────────────────────────────────────────────────
  const activeReps = repIds.filter((id) => dayLogs.get(id)?.startAt).length;
  const completedReps = repIds.filter((id) => {
    const l = dayLogs.get(id);
    return l?.startAt && l.endAt;
  }).length;
  const runningReps = repIds.filter((id) => {
    const l = dayLogs.get(id);
    return l?.startAt && !l.endAt;
  }).length;
  const notStartedReps = repIds.length - completedReps - runningReps;

  const totalVisits = [...visitMap.values()].reduce((s, v) => s + v.count, 0);
  const prevVisits = [...prevVisitMap.values()].reduce((s, v) => s + v.count, 0);
  const prevActive = repIds.filter((id) => prevDayLogs.get(id)?.startAt).length;

  const visitsDelta = delta(totalVisits, prevVisits);
  const coveredDelta = delta(covered.size, prevCovered.size);
  const activeDelta = delta(activeReps, prevActive);
  const declining = areaRows.filter((r) => r.status === "declining").length;

  // ── Areas by visits — EVERY area in scope, not just the ones with a visit
  // today. Unvisited areas show 0 rather than being dropped, so the SO sees
  // the whole depot, not just the winners. ───────────────────────────────
  const visitsByArea = new Map(visitsPerArea.map((r) => [r.area, Number(r.n) || 0]));
  const allAreaNames = [...new Set(areaRows.map((r) => r.area))];
  const areaLeaderboard = allAreaNames
    .map((area) => ({ area, n: visitsByArea.get(area) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.area.localeCompare(b.area));

  // ── Rep leaderboard ─────────────────────────────────────────────────────
  const soldByRep = new Map(repDayTotals.map((r) => [r.userId, r]));

  const repRows = reps
    .map((r) => {
      const v = visitMap.get(r.id);
      const log = dayLogs.get(r.id);
      const totals = soldByRep.get(r.id);
      return {
        id: r.id,
        name: r.name,
        visits: v?.count ?? 0,
        counters: v?.counters ?? 0,
        packets: Number(totals?.packets) || 0,
        // Stock the rep drew from the depot this morning — their target for
        // the day. Deliberately NOT sum(visits.stock), which is stock sitting
        // on counters and has nothing to do with what they set out to sell.
        pickup: log?.pickupTotal ?? 0,
        started: !!log?.startAt,
        onJob: log?.startAt ? durationLabel(log.startAt, log.endAt ?? now) : null,
      };
    })
    // Packets sold is the ranking criterion now, not visit count — a rep who
    // logs twenty walk-ins and sells nothing shouldn't outrank one who sells.
    // Visits break ties so a zero-sales day still orders by effort.
    .sort((a, b) => b.packets - a.packets || b.visits - a.visits);

  const statusDonut: DonutSegment[] = [
    { label: t("Completed"), value: completedReps, color: "var(--success)" },
    { label: t("Active"), value: runningReps, color: "var(--warning)" },
    { label: t("Not started"), value: notStartedReps, color: "var(--ink-3)" },
  ];

  // ── Highlights ──────────────────────────────────────────────────────────
  type Highlight = { tone: "good" | "warn" | "bad"; icon: IconName; text: string };
  const highlights: Highlight[] = [];
  if (visitsDelta.pct !== null && visitsDelta.pct > 0) {
    highlights.push({ tone: "good", icon: "trendUp", text: `${t("Team is")} ${visitsDelta.pct}% ${t("ahead of the day before.")}` });
  } else if (visitsDelta.pct !== null && visitsDelta.pct < 0) {
    highlights.push({ tone: "warn", icon: "trendDown", text: `${t("Team is")} ${Math.abs(visitsDelta.pct)}% ${t("behind the day before.")}` });
  }
  if (runningReps > 0 && isToday) {
    highlights.push({ tone: "warn", icon: "clock", text: `${runningReps} ${t(runningReps === 1 ? "rep hasn't clocked out yet." : "reps haven't clocked out yet.")}` });
  }
  if (notStartedReps > 0) {
    highlights.push({ tone: "warn", icon: "userOff", text: `${notStartedReps} ${t(notStartedReps === 1 ? "rep didn't start this day." : "reps didn't start this day.")}` });
  }
  if (declining > 0) {
    highlights.push({ tone: "bad", icon: "alert", text: `${declining} ${t(declining === 1 ? "counter is declining — flag for revisit." : "counters are declining — flag for revisit.")}` });
  }
  if (highlights.length === 0) {
    highlights.push({ tone: "good", icon: "check", text: t("All good — nothing needs attention right now.") });
  }

  const scopeLabel = depot?.name ?? (stockists.length > 1 ? t("All stockists") : stockists[0]?.name ?? t("Your stockist"));

  const kpis: KpiProps[] = [
    { icon: "users", tint: "var(--accent)", label: t("Active reps"), value: `${activeReps}/${reps.length}`, sub: t("clocked in"), delta: activeDelta },
    { icon: "route", tint: "#2E9E5A", label: isToday ? t("Visits today") : t("Visits"), value: String(totalVisits), sub: t("Team total"), delta: visitsDelta },
    { icon: "store", tint: "#7B2FA0", label: t("Counters covered"), value: String(covered.size), sub: t("Distinct"), delta: coveredDelta },
    { icon: "grid", tint: "#128A82", label: t("Counters in scope"), value: String(areaRows.length), sub: t("in your stockists") },
    { icon: "clock", tint: "#B9812E", label: t("Open days"), value: String(runningReps), sub: runningReps ? t("not clocked out") : t("all closed"), tone: runningReps ? "warn" : undefined },
    { icon: "alert", tint: "#C7263B", label: t("Declining"), value: String(declining), sub: t("needs attention"), tone: "bad" },
  ];

  return (
    <div>
      {/* Header + controls */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{t("Analytics Overview")}</h1>
          <p className="page-subtitle max-w-2xl">
            {t("Track your team's performance and visits across your stockists.")}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <DayPicker value={dayStr} options={dayOptions} />
          <RefreshButton />
          {stockists.length > 1 && <DepotPicker options={stockists} value={depot?.id ?? "all"} />}
        </div>
      </div>

      {/* Context strip — what you're looking at */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent)", borderColor: "transparent" }}>
          {isToday ? t("Today") : formatISTDate(dayStr)}
        </span>
        <span>·</span>
        <span>{scopeLabel}</span>
        <span>·</span>
        <span>{reps.length} {t("reps")}</span>
      </div>

      {/* KPI grid */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} t={t} />
        ))}
      </div>

      {/* Rep leaderboard — the screen's primary content, full width */}
      <div className="mb-5">
        {/* Rep leaderboard — scrolls after 5 rows */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex flex-none items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline-soft)" }}>
            <div className="flex items-center gap-3">
              <IconTile name="users" tint="var(--accent)" />
              <div>
                <h6 style={cardTitle}>{isToday ? t("Packets sold today by ISR") : t("Packets sold by ISR")}</h6>
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {t("Tap an ISR for their last 3 days")}
                </p>
              </div>
            </div>
            {repRows.length > REP_ROWS_VISIBLE && (
              <span className="chip flex-none" style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}>
                {repRows.length}
              </span>
            )}
          </div>

          <RepLeaderboard
            rows={repRows}
            rowsVisible={REP_ROWS_VISIBLE}
            date={dayStr}
            emptyLabel={t("No reps report to you yet.")}
            t={t}
          />
        </section>

      </div>

      {/* Team status + top areas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="check" tint="var(--accent)" />
            <div>
              <h6 style={cardTitle}>{t("Team status")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("By clock-in state")}</p>
            </div>
          </div>
          {reps.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No reps report to you yet.")}</p>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-5">
              <Donut segments={statusDonut} size={124} centerValue={reps.length} centerLabel={t("reps")} />
              <div className="flex flex-col gap-2">
                <StatusRow color="var(--success)" label={t("Completed")} n={completedReps} total={reps.length} />
                <StatusRow color="var(--warning)" label={t("Active")} n={runningReps} total={reps.length} />
                <StatusRow color="var(--ink-3)" label={t("Not started")} n={notStartedReps} total={reps.length} />
              </div>
            </div>
          )}
        </section>

        <section className="card flex flex-col p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <IconTile name="trophy" tint="#B9812E" />
            <div>
              <h6 style={cardTitle}>{t("Top performing areas")}</h6>
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>{isToday ? t("Visits today, by area") : t("Visits this day, by area")}</p>
            </div>
          </div>
          {areaLeaderboard.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No areas in scope yet.")}</p>
          ) : (
            <AreaLeaderboard rows={areaLeaderboard} />
          )}
        </section>

      </div>
    </div>
  );
}

// ── Presentational pieces ──────────────────────────────────────────────────

type KpiProps = {
  icon: IconName;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "bad";
  delta?: { pct: number | null; isNew: boolean };
};

/** KPI tile: tinted icon square, label, big number, then either a delta pill
 * or a plain caption. */
function Kpi({ icon, tint, label, value, sub, tone, delta: d, t }: KpiProps & { t: (k: string) => string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2.5">
        <IconTile name={icon} tint={tint} size={32} />
        <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>{label}</span>
      </div>
      <div className="mt-2.5 text-[26px] font-bold leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {value}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{sub}</div>
      {d && (
        <div className="mt-2">
          <DeltaPill d={d} t={t} />
        </div>
      )}
      {!d && tone && (
        <div className="mt-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              background: tone === "warn" ? "rgba(224,161,0,.14)" : "rgba(199,38,59,.1)",
              color: tone === "warn" ? "var(--warning)" : "var(--danger)",
            }}
          >
            {tone === "warn" ? "!" : "▲"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Green/red "▲ 12%" pill with a muted caption, like the reference. */
function DeltaPill({ d, t }: { d: { pct: number | null; isNew: boolean }; t: (k: string) => string }) {
  if (d.pct === null) {
    return (
      <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        — {d.isNew ? t("new") : t("no change")}
      </span>
    );
  }
  const up = d.pct >= 0;
  const color = up ? "var(--success)" : "var(--danger)";
  const bg = up ? "rgba(30,158,90,.12)" : "rgba(199,38,59,.1)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: bg, color }}>
        {up ? "▲" : "▼"} {Math.abs(d.pct)}%
      </span>
      <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>{t("vs prev day")}</span>
    </span>
  );
}


function StatusRow({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>{label}</span>
      <span className="flex-none font-bold tabular-nums" style={{ color: "var(--ink-1)" }}>{n}</span>
      <span className="w-9 flex-none text-right tabular-nums" style={{ color: "var(--ink-3)" }}>{pct}%</span>
    </div>
  );
}

/** Rounded tinted square holding an icon — the card-header motif. */
function IconTile({ name, tint, size = 36 }: { name: IconName; tint: string; size?: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-xl"
      style={{ height: size, width: size, background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
    >
      <Icon name={name} className={size >= 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
type IconName = "users" | "route" | "store" | "grid" | "clock" | "alert" | "check" | "trendUp" | "trendDown" | "trophy" | "userOff" | "box" | "pieChart";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", ...stroke };
  switch (name) {
    case "users":
      return (
        <svg {...p}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "route":
      return (
        <svg {...p}>
          <circle cx="6" cy="19" r="3" />
          <circle cx="18" cy="5" r="3" />
          <path d="M9 19h5a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5" />
        </svg>
      );
    case "store":
      return (
        <svg {...p}>
          <path d="M3 9V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4M3 9h18M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
          <path d="M9 13h6" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "alert":
      return (
        <svg {...p}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "trendUp":
      return (
        <svg {...p}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      );
    case "trendDown":
      return (
        <svg {...p}>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M17 17h4v-4" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M8 21h8M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
        </svg>
      );
    case "userOff":
      return (
        <svg {...p}>
          <path d="M18 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10.5" cy="7" r="4" />
          <path d="m17 3 5 5M22 3l-5 5" />
        </svg>
      );
    case "box":
      return (
        <svg {...p}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "pieChart":
      return (
        <svg {...p}>
          <path d="M21.2 15.3A10 10 0 1 1 8.7 2.8" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
  }
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: 0, color: "var(--ink-1)" };
