import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  dayLogs,
  depots,
  schemeClaims,
  users,
  visits,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { istDateString, istDayBounds } from "@/lib/date";
import { PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { LegendDot } from "@/components/ui/legend-dot";
import { StatCard } from "@/components/ui/stat-card";
import { CnfPicker } from "../_components/cnf-picker";

const DEPOT_COLORS = ["#7B2FA0", "#4C8C2B", "#B9812E", "#128A82"];
/** Fixed per-SKU colours shared with the KHQ dashboard so a segment reads the
 * same colour everywhere. */
const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

/** Days in the sales-trend chart. 7 fits the card width without label crowding
 * and gives a week's shape. */
const TREND_DAYS = 7;

function conic(active: number, dormant: number, declining: number) {
  const total = Math.max(1, active + dormant + declining);
  const a = Math.round((active / total) * 100);
  const d = Math.round((dormant / total) * 100);
  return {
    css: `conic-gradient(var(--success) 0% ${a}%, var(--warning) ${a}% ${a + d}%, var(--danger) ${a + d}% 100%)`,
    activePct: a,
  };
}

/** SVG path payload for the sales trend spark line. `max = 0` (a week with
 * zero sales) still needs to render — flat baseline, no divide-by-zero. */
function trendPaths(values: number[]) {
  const w = 320, h = 110, pad = 6;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => ({
    x: pad + i * step,
    y: h - pad - (v / max) * (h - pad * 2),
  }));
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M${pts[0].x},${h} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1].x},${h} Z`;
  return { polyline, area, pts };
}

/** IST calendar month-to-date UTC window `[start, end)` for `visited_at`. */
function istMtdBounds(instant: Date = new Date()): { start: Date; end: Date } {
  const today = istDateString(instant);
  const start = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
  const { end } = istDayBounds(instant);
  return { start, end };
}

/** UTC window covering the last N IST calendar days including today. */
function lastNIstDaysBounds(n: number): { start: Date; end: Date } {
  const { end } = istDayBounds();
  const startDay = new Date(end.getTime() - n * 24 * 60 * 60 * 1000);
  return { start: startDay, end };
}

/** IST date list ending today, in `YYYY-MM-DD`, oldest → newest. */
function lastNIstDates(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    out.push(istDateString(new Date(now - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}

export default async function HqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.accessRoles.includes("admin");
  const t = await getT();
  if (!user.accessRoles.includes("hq") && !isAdmin) {
    return <Notice title={t("C&F HQ")}>{t("You don't have C&F HQ access.")}</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs);
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <Notice title={t("C&F HQ")}>{t("No C&F HQ set up yet.")}</Notice>;
  }

  const cnfDepots = await db.select().from(depots).where(eq(depots.cnfId, selectedCnf.id));
  const depotIds = cnfDepots.map((d) => d.id);
  const hasDepots = depotIds.length > 0;

  // Bounds are cheap and shared by several queries — compute once and pass in.
  const day = istDayBounds();
  const mtd = istMtdBounds();
  const week = lastNIstDaysBounds(TREND_DAYS);
  const today = istDateString();

  // Every read runs in parallel — a dashboard is the classic place where
  // sequential awaits multiply the DB round-trip cost.
  const [
    counterRows,
    todayTotals,
    activeRepsToday,
    schemePayoutRow,
    mtdItemsRows,
    trendRows,
  ] = await Promise.all([
    hasDepots
      ? db
          .select({
            id: counters.id,
            status: counters.status,
            depotId: counters.depotId,
            name: counters.name,
            area: areas.name,
            lat: counters.lat,
            lng: counters.lng,
            phone: counters.phone,
            lastVisit: counters.lastVisitAt,
          })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.depotId, depotIds))
      : Promise.resolve([] as Array<{
          id: string; status: "active" | "dormant" | "declining"; depotId: string;
          name: string; area: string; lat: string | null; lng: string | null;
          phone: string | null; lastVisit: Date | null;
        }>),
    // Today's activity in this C&F: visits, packets, average visit duration.
    hasDepots
      ? db
          .select({
            visits: sql<number>`count(*)::int`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
            avgSeconds: sql<number>`coalesce(avg(${visits.durationSeconds}), 0)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(
            and(
              inArray(counters.depotId, depotIds),
              gte(visits.visitedAt, day.start),
              lt(visits.visitedAt, day.end),
            ),
          )
      : Promise.resolve([{ visits: 0, packets: 0, avgSeconds: 0 }]),
    // On-job hours today per rep whose depot is in this C&F. Fetched as raw
    // (startAt, endAt) pairs so JS can substitute `now` for a still-open day
    // — Postgres AVG can't do that in a portable way.
    hasDepots
      ? db
          .select({ startAt: dayLogs.startAt, endAt: dayLogs.endAt })
          .from(dayLogs)
          .innerJoin(users, eq(users.id, dayLogs.userId))
          .where(
            and(
              eq(dayLogs.logDate, today),
              inArray(users.depotId, depotIds),
              sql`'field' = ANY(${users.accessRoles}::text[])`,
            ),
          )
      : Promise.resolve([] as Array<{ startAt: Date | null; endAt: Date | null }>),
    // Scheme payouts settled today across this C&F — replaces the old fake
    // "Scheme via UPI %" (every scheme payout is UPI by design; the useful
    // number is how much actually moved).
    hasDepots
      ? db
          .select({ value: sql<number>`coalesce(sum(${schemeClaims.value}), 0)::int` })
          .from(schemeClaims)
          .where(
            and(
              inArray(schemeClaims.depotId, depotIds),
              eq(schemeClaims.status, "paid"),
              gte(schemeClaims.createdAt, day.start),
              lt(schemeClaims.createdAt, day.end),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    // Product mix (MTD): pull the items JSONB, aggregate per-segment in JS.
    // Same shape as the KHQ dashboard — matched deliberately so both pages
    // agree on the number for overlapping scopes.
    hasDepots
      ? db
          .select({ items: visits.items })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(
            and(
              inArray(counters.depotId, depotIds),
              gte(visits.visitedAt, mtd.start),
              lt(visits.visitedAt, mtd.end),
            ),
          )
      : Promise.resolve([] as Array<{ items: VisitItem[] }>),
    // Sales trend: packets sold per IST day, last N days. Truncated in SQL
    // via the fixed IST offset — matches how the rest of the app groups
    // by IST calendar day. Sparse rows filled with 0 in JS below.
    hasDepots
      ? db
          .select({
            d: sql<string>`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`,
            packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
          })
          .from(visits)
          .innerJoin(counters, eq(counters.id, visits.counterId))
          .where(
            and(
              inArray(counters.depotId, depotIds),
              gte(visits.visitedAt, week.start),
              lt(visits.visitedAt, week.end),
            ),
          )
          .groupBy(sql`(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date`)
      : Promise.resolve([] as Array<{ d: string; packets: number }>),
  ]);

  // ── Counter health ────────────────────────────────────────────────────
  const activeCount = counterRows.filter((c) => c.status === "active").length;
  const dormantCount = counterRows.filter((c) => c.status === "dormant").length;
  const decliningCount = counterRows.filter((c) => c.status === "declining").length;
  const health = conic(activeCount, dormantCount, decliningCount);
  const declining = counterRows.filter((c) => c.status === "declining");

  // ── Counter visibility ────────────────────────────────────────────────
  // Definition: a counter that has BOTH a GPS fix AND a mobile number is
  // reachable — a rep can find it on the map AND search it by phone. That's
  // the metric the field team actually cares about.
  const visibleCount = counterRows.filter((c) => c.lat != null && c.lng != null && c.phone).length;
  const visibilityPct =
    counterRows.length === 0 ? 0 : Math.round((visibleCount / counterRows.length) * 100);

  // ── Verified time/day (per rep, on-job hours today) ───────────────────
  const now = new Date();
  const perRepHours: number[] = [];
  for (const l of activeRepsToday) {
    if (!l.startAt) continue;
    const end = l.endAt ?? now;
    const hrs = Math.max(0, (end.getTime() - l.startAt.getTime()) / (1000 * 60 * 60));
    perRepHours.push(hrs);
  }
  const avgOnJobHours =
    perRepHours.length === 0
      ? 0
      : perRepHours.reduce((s, h) => s + h, 0) / perRepHours.length;

  // ── Today totals ──────────────────────────────────────────────────────
  const packetsToday = todayTotals[0]?.packets ?? 0;
  const schemePayoutToday = schemePayoutRow[0]?.value ?? 0;

  // ── Depot split donut ─────────────────────────────────────────────────
  const depotSplit = cnfDepots.map((d, i) => ({
    name: d.name,
    count: counterRows.filter((c) => c.depotId === d.id).length,
    color: DEPOT_COLORS[i % DEPOT_COLORS.length],
  }));
  const splitTotal = Math.max(1, depotSplit.reduce((s, d) => s + d.count, 0));
  const depotConicStops = depotSplit
    .map((d, i) => {
      const before = depotSplit.slice(0, i).reduce((s, x) => s + x.count, 0);
      const from = (before / splitTotal) * 100;
      const to = ((before + d.count) / splitTotal) * 100;
      return `${d.color} ${from.toFixed(1)}% ${to.toFixed(1)}%`;
    })
    .join(", ");

  // ── Product mix (MTD) ─────────────────────────────────────────────────
  const soldBySegment = new Map<string, number>();
  for (const row of mtdItemsRows) {
    const items = (row.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!it || typeof it.segment !== "string") continue;
      soldBySegment.set(it.segment, (soldBySegment.get(it.segment) ?? 0) + (Number(it.sold) || 0));
    }
  }
  const mixTotal = [...soldBySegment.values()].reduce((s, n) => s + n, 0);
  const productMix = PRODUCT_SEGMENTS.map((p) => {
    const sold = soldBySegment.get(p.value) ?? 0;
    const pct = mixTotal > 0 ? Math.round((sold / mixTotal) * 100) : 0;
    return { label: p.value, sold, pct, color: SEGMENT_COLOR[p.value] };
  });

  // ── Sales trend (7 days, filled) ──────────────────────────────────────
  const packetsByDay = new Map(trendRows.map((r) => [r.d, Number(r.packets) || 0]));
  const dateList = lastNIstDates(TREND_DAYS);
  const trendValues = dateList.map((d) => packetsByDay.get(d) ?? 0);
  const trend = trendPaths(trendValues);

  const kpis = [
    {
      label: t("Counter visibility"),
      value: `${visibilityPct}%`,
      sub: t("geo-tagged with owner mobile"),
    },
    {
      label: t("Verified time/day"),
      value: `${avgOnJobHours.toFixed(1)}h`,
      sub: t("avg. counter time per salesman"),
    },
    {
      label: t("Packets sold today"),
      value: String(packetsToday),
      sub: t("market sales, all reps"),
    },
    {
      label: t("Scheme payouts today"),
      value: `₹${schemePayoutToday.toLocaleString("en-IN")}`,
      sub: t("settled via UPI"),
    },
    {
      label: t("Declining counters"),
      value: String(decliningCount),
      sub: t("flagged for revisit"),
      danger: true,
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2.5 text-[13px]" style={{ color: "var(--ink-2)" }}>
        <span>{t("Headquarters (Kanpur) →")} {selectedCnf.name} → {cnfDepots.length} {t("depots")}</span>
        {isAdmin && allCnfs.length > 1 && (
          <>
            <span className="flex-1" />
            <label className="text-[12px]">{t("C&F HQ")}</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>

      <h4 className="page-title mb-4">{t("Overview")}</h4>
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} sub={k.sub} danger={k.danger} />
        ))}
      </div>

      <div className="mb-4 grid items-stretch gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-5">
          <h6 style={cardTitle}>{t("Sales trend")}</h6>
          <p style={cardSub}>{t("Packets sold, last 7 days")}</p>
          {trendValues.every((v) => v === 0) ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("No sales in the last 7 days.")}
            </p>
          ) : (
            <svg viewBox="0 0 320 110" style={{ width: "100%", height: 150 }} preserveAspectRatio="none">
              <path d={trend.area} fill="var(--accent-tint)" stroke="none" />
              <polyline points={trend.polyline} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              {trend.pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--accent)" stroke="#fff" strokeWidth="1.2" />
              ))}
            </svg>
          )}
        </div>
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Counter health")}</h6>
          <p style={cardSub}>{t("Overall health of the C&F, by counter status")}</p>
          <div className="flex flex-1 items-center gap-4.5">
            <div className="relative h-24 w-24 flex-none rounded-full" style={{ background: health.css }}>
              <div
                className="absolute inset-4 flex items-center justify-center rounded-full text-[15px] font-bold"
                style={{ background: "var(--bg)", fontFamily: "var(--font-display)" }}
              >
                {health.activePct}%
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
              <LegendDot color="var(--success)" label={`${t("Active")} — ${activeCount}`} square />
              <LegendDot color="var(--warning)" label={`${t("Dormant")} — ${dormantCount}`} square />
              <LegendDot color="var(--danger)" label={`${t("Declining")} — ${decliningCount}`} square />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-7 grid items-stretch gap-4 sm:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Counters by depot")}</h6>
          <p style={cardSub}>{t("Coverage split, by depot")}</p>
          {depotSplit.length === 0 || splitTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("No counters mapped yet.")}
            </p>
          ) : (
            <div className="flex flex-1 items-center gap-4">
              <div className="h-[88px] w-[88px] flex-none rounded-full" style={{ background: `conic-gradient(${depotConicStops})` }} />
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
                {depotSplit.map((d) => (
                  <LegendDot key={d.name} color={d.color} label={`${d.name} — ${d.count} (${Math.round((d.count / splitTotal) * 100)}%)`} square />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>{t("Product mix")}</h6>
          <p style={cardSub}>{t("Packets sold MTD, by SKU")}</p>
          {mixTotal === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("No sales this month yet.")}
            </p>
          ) : (
            <div className="flex flex-col gap-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
              {productMix.map((p) => (
                <LegendDot key={p.label} color={p.color} label={`${p.label} — ${p.pct}% (${p.sold})`} square />
              ))}
            </div>
          )}
        </div>
      </div>

      <h4 className="page-title mb-3.5">{t("Declining counters")} ({declining.length})</h4>
      {declining.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No declining counters — healthy C&F.")}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {["Counter", "Area", "Last visit"].map((h) => (
                  <th key={h}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {declining.map((d) => (
                <tr key={d.id}>
                  <td className="font-semibold">{d.name}</td>
                  <td>{d.area}</td>
                  <td>{d.lastVisit ? new Date(d.lastVisit).toISOString().slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px", color: "var(--ink-1)" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
