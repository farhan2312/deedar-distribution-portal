import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, dayLogs, stockists, users, visits, type ProductSegment, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { durationLabel, formatISTDate, formatISTTime, istDateString } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { pickupBarColor, soldAgainstPickup } from "@/lib/field/day-stock";
import { competitorDisplayLabel, formatDuration, PRODUCT_SEGMENTS } from "@/lib/field/products";
import { istEndOf, istStartOf } from "@/lib/khq/range";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { IsrDayPicker } from "../../_components/day-picker";

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
  searchParams: Promise<{ date?: string }>;
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

  // The date floor is THIS ISR's first visit, so the picker covers their whole
  // history rather than the company's.
  const [first] = await db
    .select({ d: sql<string | null>`min(${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date::text` })
    .from(visits)
    .where(eq(visits.userId, isrId));

  const now = nowInstant();
  const today = istDateString(now);
  // Opens on today; the picker moves it to any single day in their history.
  const { date: requestedDate } = await searchParams;
  const minDate = first?.d && first.d < today ? first.d : today;
  const isDate = (d: string | undefined): d is string =>
    !!d && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d);
  const date = isDate(requestedDate)
    ? requestedDate < minDate
      ? minDate
      : requestedDate > today
        ? today
        : requestedDate
    : today;

  const dayStart = istStartOf(date);
  const dayEnd = istEndOf(date);
  const inRange = and(
    eq(visits.userId, isrId),
    gte(visits.visitedAt, dayStart),
    lt(visits.visitedAt, dayEnd),
  );

  const [visitRows, createdRows, logRows, lifetime, lifetimeCreated] = await Promise.all([
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
      .orderBy(desc(visits.visitedAt)),
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
      .orderBy(desc(counters.createdAt)),
    db
      .select()
      .from(dayLogs)
      .where(and(eq(dayLogs.userId, isrId), eq(dayLogs.logDate, date))),
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

  const log = logRows[0] ?? null;
  const packets = visitRows.reduce((sum, v) => sum + v.sold, 0);
  const pickup = log?.pickupTotal ?? 0;

  // Per-SKU split, summed from the items JSONB in JS — a jsonb SRF join errors
  // on any non-array legacy row, same as on the dashboards.
  const bySegment = new Map<string, number>();
  for (const v of visitRows) {
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
    remaining: log?.remainingTotal ?? 0,
    achieved: soldAgainstPickup(packets, pickup),
    onJob: log?.startAt ? durationLabel(log.startAt, log.endAt ?? (date === today ? now : null)) : "—",
  };
  const hasActivity = visitRows.length > 0 || createdRows.length > 0 || !!log?.startAt;

  const coveredToday = new Set(visitRows.map((v) => v.counterId)).size;
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
            {formatISTDate(date)}
            {date === today && ` (${t("Today")})`}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <IsrDayPicker value={date} minDate={minDate} maxDate={today} />
        </div>
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
        {t("All time — the day below is filtered by the date picker.")}
      </p>

      {!hasActivity ? (
        <Notice title={isr.name}>{t("No activity on this day.")}</Notice>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="card overflow-hidden p-0">
              {/* Day header: the figures for this day */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
                style={{ borderColor: "var(--hairline-soft)" }}
              >
                <div className="min-w-0">
                  <h2
                    className="text-[16px] font-bold"
                    style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
                  >
                    {t("Day log")}
                  </h2>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {log?.startAt
                      ? `${formatISTTime(log!.startAt!)} → ${log!.endAt ? formatISTTime(log!.endAt) : t("still open")} · ${day.onJob} ${t("on job")}`
                      : t("Day not started")}
                    {day.pickup > 0 && (
                      <>
                        {" · "}
                        {t("Picked up")} <strong style={{ color: "var(--ink-2)" }}>{day.pickup}</strong>
                        {log?.endAt && (
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
                  <DayStat label={t("Visits")} value={visitRows.length} />
                  <DayStat label={t("Covered")} value={coveredToday} />
                  <DayStat label={t("New")} value={createdRows.length} />
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
              {visitRows.length === 0 ? (
                <p className="px-5 pb-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t("No visits on this day.")}
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        {["Time", "Counter", "Area", "Sold", "Stock", "Rank", "Competitor", "On counter"].map((h) => (
                          <th key={h}>{t(h)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitRows.map((v) => (
                        <tr key={v.id}>
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

              {/* Counters added */}
              <div className="px-5 pt-4">
                <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                  {t("New counters")}
                </h6>
              </div>
              {createdRows.length === 0 ? (
                <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t("No counters added on this day.")}
                </p>
              ) : (
                <div className="grid gap-2.5 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
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
                        <span className="tabular-nums">{formatISTTime(c.createdAt)}</span>
                        {c.lat == null || c.lng == null ? (
                          <span style={{ color: "var(--warning)" }}>· {t("no GPS")}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
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
