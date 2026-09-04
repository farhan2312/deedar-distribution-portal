import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, dayLogs, stockists, users, visits, type ProductSegment, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, formatISTTime, istDateString, minutesLabel } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { pickupBarColor, soldAgainstPickup } from "@/lib/field/day-stock";
import { competitorDisplayLabel, formatDuration, PRODUCT_SEGMENTS } from "@/lib/field/products";
import { resolveRange, type RangeParams } from "@/lib/khq/range";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PERIOD_PRESETS } from "@/lib/khq/periods";
import { ArrowPager, UrlPagination } from "@/components/ui/url-pagination";
import { PeriodFilter } from "../../_components/period-filter";

/** Visits per page. A visit is a table row, so this matches the other tables. */
const VISITS_PER_PAGE = 25;

/** New counters per page: six across x five rows of cards. */
const COUNTERS_PER_PAGE = 30;

const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

export default async function KhqIsrPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RangeParams & { vpage?: string; cpage?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  const isAdmin = user.accessRoles.includes("admin");
  if (!canAccess(user, "khq") && !isAdmin) {
    return <Notice title={t("ISR detail")}>{t("You don't have Kanpur HQ access.")}</Notice>;
  }

  const { id: isrId } = await params;
  const [isr] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      roles: users.accessRoles,
      depot: stockists.name,
    })
    .from(users)
    .leftJoin(stockists, eq(stockists.id, users.stockistId))
    .where(eq(users.id, isrId))
    .limit(1);

  if (!isr || !isr.roles.includes("field")) {
    return <Notice title={t("ISR detail")}>{t("No such ISR.")}</Notice>;
  }

  // The calendar floor is THIS ISR's first visit, so the filter covers their
  // whole history rather than the company's — and "All time" means their all
  // time, not the company's.
  const [first] = await db
    .select({ d: sql<string | null>`min(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text` })
    .from(visits)
    .where(eq(visits.userId, isrId));

  const now = nowInstant();
  const today = istDateString(now);
  const sp = await searchParams;
  const range = resolveRange(sp, first?.d ?? null);
  const singleDay = range.from === range.to;

  // Both lists are paged in SQL and page independently, so they each own a
  // param. The page number is resolved after the counts come back, since a
  // range with fewer rows than the URL asks for has to clamp rather than show
  // an empty list.
  const askedVisitPage = Math.max(1, Number.parseInt(sp.vpage ?? "1", 10) || 1);
  const askedCounterPage = Math.max(1, Number.parseInt(sp.cpage ?? "1", 10) || 1);

  const dayStart = range.start;
  const dayEnd = range.end;
  const inRange = and(
    eq(visits.userId, isrId),
    gte(visits.visitedAt, dayStart),
    lt(visits.visitedAt, dayEnd),
  );

  /**
   * Counts and aggregates first, rows second.
   *
   * The table used to render every visit in the range, and the totals above it
   * were derived from that same array. Paging the array would have quietly
   * turned "packets sold" into "packets sold on this page", so the figures now
   * come from SQL over the whole range and only the table is paged.
   */
  const [visitAgg, counterAgg, itemRows, logRows, lifetime, lifetimeCreated] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        covered: sql<number>`count(distinct ${visits.counterId})::int`,
      })
      .from(visits)
      .where(inRange),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(counters)
      .where(
        and(
          eq(counters.createdByUserId, isrId),
          gte(counters.createdAt, dayStart),
          lt(counters.createdAt, dayEnd),
        ),
      ),
    // Just the items column, for the per-SKU split. One narrow column across
    // the range is far less than the joined rows it used to be read from, and
    // the split has to cover every visit rather than one page of them.
    db.select({ items: visits.items }).from(visits).where(inRange),
    db
      .select()
      .from(dayLogs)
      .where(
        and(
          eq(dayLogs.userId, isrId),
          gte(dayLogs.logDate, range.from),
          lte(dayLogs.logDate, range.to),
        ),
      )
      .orderBy(desc(dayLogs.logDate)),
    // Lifetime totals — deliberately unbounded by the date picker. The tiles
    // answer "how much has this ISR done", which shouldn't reset to zero just
    // because you paged to a day they were off.
    db
      .select({
        visits: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        counters: sql<number>`count(distinct ${visits.counterId})::int`,
        days: sql<number>`count(distinct (${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date)::int`,
      })
      .from(visits)
      .where(eq(visits.userId, isrId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(counters)
      .where(eq(counters.createdByUserId, isrId)),
  ]);

  const visitTotal = visitAgg[0]?.n ?? 0;
  const createdTotal = counterAgg[0]?.n ?? 0;
  const visitPages = Math.max(1, Math.ceil(visitTotal / VISITS_PER_PAGE));
  const counterPages = Math.max(1, Math.ceil(createdTotal / COUNTERS_PER_PAGE));
  const visitPage = Math.min(askedVisitPage, visitPages);
  const counterPage = Math.min(askedCounterPage, counterPages);

  const [visitRows, createdRows] = await Promise.all([
    db
      .select({
        id: visits.id,
        visitedAt: visits.visitedAt,
        sold: visits.sold,
        stock: visits.stock,
        items: visits.items,
        rank: visits.rank,
        competitor: visits.competitor,
        competitorBrand: visits.competitorBrand,
        durationSeconds: visits.durationSeconds,
        counterId: visits.counterId,
        counterName: counters.name,
        counterType: counters.type,
        counterTypeOther: counters.typeOther,
        area: areas.name,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(inRange)
      // Two visits in the same second would otherwise straddle a page boundary
      // unpredictably; the id makes the sort total.
      .orderBy(desc(visits.visitedAt), asc(visits.id))
      .limit(VISITS_PER_PAGE)
      .offset((visitPage - 1) * VISITS_PER_PAGE),
    db
      .select({
        id: counters.id,
        name: counters.name,
        type: counters.type,
        typeOther: counters.typeOther,
        area: areas.name,
        createdAt: counters.createdAt,
        lat: counters.lat,
        lng: counters.lng,
      })
      .from(counters)
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(
        and(
          eq(counters.createdByUserId, isrId),
          gte(counters.createdAt, dayStart),
          lt(counters.createdAt, dayEnd),
        ),
      )
      .orderBy(desc(counters.createdAt), asc(counters.id))
      .limit(COUNTERS_PER_PAGE)
      .offset((counterPage - 1) * COUNTERS_PER_PAGE),
  ]);

  // A one-day window still has exactly one log, so the single-day view keeps
  // its clock times; a longer one sums instead.
  const log = singleDay ? (logRows[0] ?? null) : null;
  const packets = visitAgg[0]?.packets ?? 0;
  const pickup = logRows.reduce((sum, l) => sum + (l.pickupTotal ?? 0), 0);
  const remaining = logRows.reduce((sum, l) => sum + (l.remainingTotal ?? 0), 0);
  const daysWorked = logRows.filter((l) => l.startAt).length;
  // An open day counts up to now, but only if it is actually today — an
  // unclosed log from last month would otherwise contribute weeks.
  const onJobMinutes = logRows.reduce((sum, l) => {
    if (!l.startAt) return sum;
    const end = l.endAt ?? (l.logDate === today ? now : null);
    if (!end) return sum;
    return sum + Math.max(0, (end.getTime() - l.startAt.getTime()) / 60000);
  }, 0);
  const anyOpen = logRows.some((l) => l.startAt && !l.endAt);

  // Per-SKU split, summed from the items JSONB in JS — a jsonb SRF join errors
  // on any non-array legacy row, same as on the dashboards.
  const bySegment = new Map<string, number>();
  for (const v of itemRows) {
    const items = (v.items ?? []) as VisitItem[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!it || typeof it.segment !== "string") continue;
      bySegment.set(it.segment, (bySegment.get(it.segment) ?? 0) + (Number(it.sold) || 0));
    }
  }

  const day = {
    packets,
    pickup,
    remaining,
    achieved: soldAgainstPickup(packets, pickup),
    onJob: daysWorked > 0 ? minutesLabel(onJobMinutes) : "—",
  };
  const hasActivity = visitTotal > 0 || createdTotal > 0 || daysWorked > 0;

  const covered = visitAgg[0]?.covered ?? 0;
  const total = lifetime[0] ?? { visits: 0, packets: 0, counters: 0, days: 0 };
  const totalCreated = lifetimeCreated[0]?.n ?? 0;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/khq/dashboard" className="link text-[12.5px]">
            {t("← Back to dashboard")}
          </Link>
          <h1 className="page-title mt-1">{isr.name}</h1>
          <p className="page-subtitle">
            {isr.depot ?? t("No stockist")}
            {isr.phone ? ` · ${isr.phone}` : ""}
            {" · "}
            {t(range.label)}
            {range.note ? ` ${t(range.note)}` : ""}
          </p>
        </div>
      </div>

      {/* Period — pills plus calendars need the full width. This page gets the
          full preset list: one ISR's single day is the question it answers, so
          Today and Yesterday belong here even though they don't on a
          company-wide dashboard. */}
      <div className="mb-4">
        <PeriodFilter
          period={range.period}
          from={range.from}
          to={range.to}
          minDate={range.minDate}
          maxDate={range.maxDate}
          presets={PERIOD_PRESETS}
        />
      </div>

      {/* Lifetime totals, not the selected day's — the day is in the card
          below. Packets sold stands alone with no pickup denominator: pickup is
          a per-day target, so summing it across a career compares two different
          things. */}
      <div className="mb-2 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <SummaryTile label={t("Packets sold")} value={total.packets} tint="#7B2FA0" accent />
        <SummaryTile label={t("Visits")} value={total.visits} tint="#2E9E5A" />
        <SummaryTile label={t("Counters covered")} value={total.counters} tint="#128A82" />
        <SummaryTile label={t("New counters")} value={totalCreated} tint="#B9812E" />
        <SummaryTile label={t("Days worked")} value={total.days} tint="#2E5FA3" />
      </div>
      <p className="mb-5 text-[12px]" style={{ color: "var(--ink-3)" }}>
        {t("All time — the breakdown below follows the period filter.")}
      </p>

      {!hasActivity ? (
        <Notice title={isr.name}>
          {singleDay ? t("No activity on this day.") : t("No activity in this period.")}
        </Notice>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="card overflow-hidden p-0">
              {/* The figures for the selected window */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
                style={{ borderColor: "var(--hairline-soft)" }}
              >
                <div className="min-w-0">
                  <h2
                    className="text-[16px] font-bold"
                    style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
                  >
                    {singleDay ? t("Day log") : t("Day logs")}
                  </h2>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {singleDay
                      ? log?.startAt
                        ? `${formatISTTime(log.startAt)} → ${log.endAt ? formatISTTime(log.endAt) : t("still open")} · ${day.onJob} ${t("on job")}`
                        : t("Day not started")
                      : daysWorked > 0
                        ? `${daysWorked} ${t("days worked")} · ${day.onJob} ${t("on job")}${anyOpen ? ` · ${t("one still open")}` : ""}`
                        : t("No day started in this period")}
                    {day.pickup > 0 && (
                      <>
                        {" · "}
                        {t("Picked up")} <strong style={{ color: "var(--ink-2)" }}>{day.pickup}</strong>
                        {(singleDay ? !!log?.endAt : day.remaining > 0) && (
                          <>
                            {" · "}
                            {t("Remaining")} <strong style={{ color: "var(--ink-2)" }}>{day.remaining}</strong>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <DayStat label={t("Sold")} value={day.packets} outOf={day.pickup || null} accent />
                  <DayStat label={t("Visits")} value={visitTotal} />
                  <DayStat label={t("Covered")} value={covered} />
                  <DayStat label={t("New")} value={createdTotal} />
                </div>
              </div>

              {/* Sold against that day's pickup */}
              <div className="px-5 pt-3">
                <ProgressBar
                  pct={day.achieved ?? (day.packets > 0 ? 100 : 0)}
                  height={6}
                  color={
                    day.achieved != null
                      ? pickupBarColor(day.achieved)
                      : day.packets > 0
                        ? "var(--accent)"
                        : "var(--hairline)"
                  }
                />
              </div>

              {/* Per-SKU split */}
              {day.packets > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 pt-3">
                  {PRODUCT_SEGMENTS.filter((p) => (bySegment.get(p.value) ?? 0) > 0).map((p) => (
                    <span key={p.value} className="flex items-center gap-1.5 text-[12px]">
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: SEGMENT_COLOR[p.value] }} />
                      <span style={{ color: "var(--ink-3)" }}>{p.label}</span>
                      <strong className="tabular-nums" style={{ color: "var(--ink-1)" }}>
                        {bySegment.get(p.value)}
                      </strong>
                    </span>
                  ))}
                </div>
              )}

              {/* Visits */}
              <div className="px-5 pt-4">
                <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                  {t("Visits")}
                </h6>
              </div>
              {visitTotal === 0 ? (
                <p className="px-5 pb-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {singleDay ? t("No visits on this day.") : t("No visits in this period.")}
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        {(singleDay
                          ? ["Time", "Counter", "Area", "Sold", "Stock", "Rank", "Competitor", "On counter"]
                          : ["Date", "Time", "Counter", "Area", "Sold", "Stock", "Rank", "Competitor", "On counter"]
                        ).map((h) => (
                          <th key={h}>{t(h)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitRows.map((v) => (
                        <tr key={v.id}>
                          {!singleDay && (
                            <td className="whitespace-nowrap tabular-nums">{formatISTDate(v.visitedAt)}</td>
                          )}
                          <td className="whitespace-nowrap tabular-nums">{formatISTTime(v.visitedAt)}</td>
                          <td className="font-semibold">
                            {v.counterName}
                            <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              {t(counterTypeLabel(v.counterType, v.counterTypeOther))}
                            </div>
                          </td>
                          <td>{v.area}</td>
                          <td
                            className="tabular-nums font-semibold"
                            style={{ color: v.sold > 0 ? "var(--accent)" : "var(--ink-3)" }}
                          >
                            {v.sold}
                          </td>
                          <td className="tabular-nums">{v.stock}</td>
                          <td className="tabular-nums">{v.rank ?? "—"}</td>
                          <td>{t(competitorDisplayLabel(v.competitor, v.competitorBrand))}</td>
                          <td className="tabular-nums">{formatDuration(v.durationSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {visitPages > 1 && (
                <div className="px-5 pb-1 pt-2">
                  <UrlPagination page={visitPage} totalPages={visitPages} param="vpage" />
                </div>
              )}

              {/* Counters added */}
              <div className="px-5 pt-4">
                <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                  {t("New counters")}
                </h6>
              </div>
              {createdTotal === 0 ? (
                <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {singleDay ? t("No counters added on this day.") : t("No counters added in this period.")}
                </p>
              ) : (
                // Six across, so a full page is five tidy rows of six.
                <div className="grid gap-2.5 px-5 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {createdRows.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: "var(--hairline-soft)", background: "var(--bg-soft)" }}
                    >
                      <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>
                        {c.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {t(counterTypeLabel(c.type, c.typeOther))} · {c.area}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                        <span className="tabular-nums">
                          {singleDay ? formatISTTime(c.createdAt) : formatISTDate(c.createdAt)}
                        </span>
                        {c.lat == null || c.lng == null ? (
                          <span style={{ color: "var(--warning)" }}>· {t("no GPS")}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {counterPages > 1 && (
                <div className="px-5 pb-5">
                  <ArrowPager
                    page={counterPage}
                    totalPages={counterPages}
                    total={createdTotal}
                    pageSize={COUNTERS_PER_PAGE}
                    param="cpage"
                    unit={t("counters")}
                  />
                </div>
              )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  outOf,
  tint,
  accent,
}: {
  label: string;
  value: number;
  /** Denominator, rendered as "5/50". Null when there is nothing to compare to. */
  outOf?: number | null;
  tint: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: tint }} />
        <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
          {label}
        </span>
      </div>
      <div
        className="mt-2 text-[24px] font-bold leading-none tabular-nums"
        style={{
          fontFamily: "var(--font-display)",
          color: value > 0 ? (accent ? "var(--accent)" : "var(--ink-1)") : "var(--ink-3)",
        }}
      >
        {value.toLocaleString("en-IN")}
        {outOf != null && (
          <span className="text-[15px] font-medium" style={{ color: "var(--ink-3)" }}>
            /{outOf.toLocaleString("en-IN")}
          </span>
        )}
      </div>
    </div>
  );
}

function DayStat({
  label,
  value,
  outOf,
  accent,
}: {
  label: string;
  value: number;
  outOf?: number | null;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className="text-[18px] font-bold leading-none tabular-nums"
        style={{
          fontFamily: "var(--font-display)",
          color: value > 0 ? (accent ? "var(--accent)" : "var(--ink-1)") : "var(--ink-3)",
        }}
      >
        {value.toLocaleString("en-IN")}
        {outOf != null && (
          <span className="text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
            /{outOf.toLocaleString("en-IN")}
          </span>
        )}
      </div>
      <div className="mt-1 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
    </div>
  );
}
