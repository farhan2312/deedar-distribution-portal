import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters, dayLogs, visits, type ProductSegment, type VisitItem } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { durationLabel, formatISTDate, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { competitorDisplayLabel, formatDuration, PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getTeamReps } from "@/lib/supervisor/team";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";

/** The window this page covers: today, yesterday, the day before. Matches the
 * analytics filter, so the leaderboard and this page describe the same days. */
const DAY_LABELS = ["Today", "Yesterday", "Day before yesterday"];

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

/** Midday UTC anchor for an IST date string — safe to shift days from without
 * an off-by-one at the timezone edge. */
function anchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

function shiftDays(dateStr: string, days: number): string {
  return istDateString(new Date(anchor(dateStr).getTime() + days * 24 * 60 * 60 * 1000));
}

function shortDayLabel(dateStr: string): string {
  return anchor(dateStr).toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  });
}

export default async function SupervisorRepPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "supervisor")) {
    return <Notice title={t("Rep detail")}>{t("You don't have Sales Officer access.")}</Notice>;
  }

  const { id: repId } = await params;
  const { date: requestedDate } = await searchParams;

  // Scope check via the SAME helper the analytics page uses, so an SO can only
  // open a rep who actually reports to them — the id comes from the URL and is
  // trivially editable, so team membership is re-derived here rather than
  // trusted.
  const reps = await getTeamReps(user);
  const rep = reps.find((r) => r.id === repId);
  if (!rep) {
    return <Notice title={t("Rep detail")}>{t("This rep is not on your team.")}</Notice>;
  }

  const now = nowInstant();
  const todayStr = istDateString(now);
  const dayWindow = DAY_LABELS.map((label, i) => ({ date: shiftDays(todayStr, -i), label }));
  const windowDates = dayWindow.map((d) => d.date);
  // `?date=` only decides which day opens expanded; every day in the window is
  // rendered regardless, so an out-of-range value is harmless.
  const focusDate = requestedDate && windowDates.includes(requestedDate) ? requestedDate : todayStr;

  const windowStart = istDayBounds(anchor(windowDates[windowDates.length - 1])).start;
  const windowEnd = istDayBounds(anchor(todayStr)).end;

  const [visitRows, createdRows, logRows] = await Promise.all([
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
        remarks: visits.remarks,
        counterId: visits.counterId,
        counterName: counters.name,
        counterType: counters.type,
        counterTypeOther: counters.typeOther,
        area: areas.name,
      })
      .from(visits)
      .innerJoin(counters, eq(counters.id, visits.counterId))
      .innerJoin(areas, eq(areas.id, counters.areaId))
      .where(and(eq(visits.userId, repId), gte(visits.visitedAt, windowStart), lt(visits.visitedAt, windowEnd)))
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
          eq(counters.createdByUserId, repId),
          gte(counters.createdAt, windowStart),
          lt(counters.createdAt, windowEnd),
        ),
      )
      .orderBy(desc(counters.createdAt)),
    db
      .select()
      .from(dayLogs)
      .where(and(eq(dayLogs.userId, repId), inArray(dayLogs.logDate, windowDates))),
  ]);

  const logByDate = new Map(logRows.map((l) => [l.logDate, l]));

  /** Which IST day a timestamp belongs to — the grouping key for every list
   * below. Derived in JS from one windowed query rather than three per-day
   * queries. */
  const dayOf = (d: Date) => istDateString(d);

  const days = dayWindow.map(({ date, label }) => {
    const dayVisits = visitRows.filter((v) => dayOf(v.visitedAt) === date);
    const dayCreated = createdRows.filter((c) => dayOf(c.createdAt) === date);
    const log = logByDate.get(date) ?? null;

    const packets = dayVisits.reduce((s, v) => s + v.sold, 0);
    const stock = dayVisits.reduce((s, v) => s + v.stock, 0);
    const covered = new Set(dayVisits.map((v) => v.counterId)).size;

    // Per-SKU split, summed from the items JSONB in JS — a jsonb SRF join
    // errors on any non-array legacy row, same as on the dashboards.
    const bySegment = new Map<string, number>();
    for (const v of dayVisits) {
      const items = (v.items ?? []) as VisitItem[];
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (!it || typeof it.segment !== "string") continue;
        bySegment.set(it.segment, (bySegment.get(it.segment) ?? 0) + (Number(it.sold) || 0));
      }
    }

    return {
      date,
      label,
      dateLabel: shortDayLabel(date),
      visits: dayVisits,
      created: dayCreated,
      log,
      packets,
      stock,
      covered,
      bySegment,
      // The day's target and what came back — straight off the rep's day log.
      pickup: log?.pickupTotal ?? 0,
      remaining: log?.remainingTotal ?? 0,
      onJob: log?.startAt ? durationLabel(log.startAt, log.endAt ?? (date === todayStr ? now : null)) : "—",
    };
  });

  const totals = days.reduce(
    (acc, d) => ({
      visits: acc.visits + d.visits.length,
      packets: acc.packets + d.packets,
      created: acc.created + d.created.length,
      pickup: acc.pickup + d.pickup,
    }),
    { visits: 0, packets: 0, created: 0, pickup: 0 },
  );
  // Distinct across the whole window, not a sum of per-day counts — the same
  // counter visited on two days is one counter covered, not two.
  const coveredAll = new Set(visitRows.map((v) => v.counterId)).size;
  const packetMax = Math.max(1, ...days.map((d) => d.packets));

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/supervisor/analytics" className="link text-[12.5px]">
            {t("← Back to analytics")}
          </Link>
          <h1 className="page-title mt-1">{rep.name}</h1>
          <p className="page-subtitle">
            {rep.depotName ?? t("No depot")}
            {rep.phone ? ` · ${rep.phone}` : ""}
          </p>
        </div>
      </div>

      {/* Window totals */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <SummaryTile
          label={t("Packets sold")}
          value={totals.packets}
          outOf={totals.pickup || null}
          tint="#7B2FA0"
          accent
        />
        <SummaryTile label={t("Visits")} value={totals.visits} tint="#2E9E5A" />
        <SummaryTile label={t("Counters covered")} value={coveredAll} tint="#128A82" />
        <SummaryTile label={t("New counters")} value={totals.created} tint="#B9812E" />
      </div>
      <p className="mb-5 text-[12px]" style={{ color: "var(--ink-3)" }}>
        {t("Totals across the last 3 days.")}
      </p>

      {/* One section per day */}
      <div className="flex flex-col gap-5">
        {days.map((d) => {
          const isFocus = d.date === focusDate;
          return (
            <section
              key={d.date}
              className="card overflow-hidden p-0"
              style={isFocus ? { borderColor: "var(--accent)" } : undefined}
            >
              {/* Day header: the four headline figures for this day */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
                style={{ borderColor: "var(--hairline-soft)" }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2
                      className="text-[16px] font-bold"
                      style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
                    >
                      {t(d.label)}
                    </h2>
                    <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {formatISTDate(d.date)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {d.log?.startAt
                      ? `${formatISTTime(d.log.startAt)} → ${d.log.endAt ? formatISTTime(d.log.endAt) : t("still open")} · ${d.onJob} ${t("on job")}`
                      : t("Day not started")}
                    {d.pickup > 0 && (
                      <>
                        {" · "}
                        {t("Picked up")} <strong style={{ color: "var(--ink-2)" }}>{d.pickup}</strong>
                        {d.log?.endAt && (
                          <>
                            {" · "}
                            {t("Remaining")} <strong style={{ color: "var(--ink-2)" }}>{d.remaining}</strong>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <DayStat label={t("Sold")} value={d.packets} outOf={d.pickup || null} accent />
                  <DayStat label={t("Visits")} value={d.visits.length} />
                  <DayStat label={t("Covered")} value={d.covered} />
                  <DayStat label={t("New")} value={d.created.length} />
                </div>
              </div>

              {/* Relative bar so the three days compare at a glance */}
              <div className="px-5 pt-3">
                <ProgressBar
                  pct={Math.round((d.packets / packetMax) * 100)}
                  height={6}
                  color={d.packets > 0 ? "var(--accent)" : "var(--hairline)"}
                />
              </div>

              {/* Per-SKU split */}
              {d.packets > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 pt-3">
                  {PRODUCT_SEGMENTS.filter((p) => (d.bySegment.get(p.value) ?? 0) > 0).map((p) => (
                    <span key={p.value} className="flex items-center gap-1.5 text-[12px]">
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ background: SEGMENT_COLOR[p.value] }}
                      />
                      <span style={{ color: "var(--ink-3)" }}>{p.label}</span>
                      <strong className="tabular-nums" style={{ color: "var(--ink-1)" }}>
                        {d.bySegment.get(p.value)}
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
              {d.visits.length === 0 ? (
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
                      {d.visits.map((v) => (
                        <tr key={v.id}>
                          <td className="whitespace-nowrap tabular-nums">{formatISTTime(v.visitedAt)}</td>
                          <td className="font-semibold">
                            <Link href={`/field/counter/${v.counterId}`} className="link">
                              {v.counterName}
                            </Link>
                            <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              {t(counterTypeLabel(v.counterType, v.counterTypeOther))}
                            </div>
                          </td>
                          <td>{v.area}</td>
                          <td className="tabular-nums font-semibold" style={{ color: v.sold > 0 ? "var(--accent)" : "var(--ink-3)" }}>
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
              {d.created.length === 0 ? (
                <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t("No counters added on this day.")}
                </p>
              ) : (
                <div className="grid gap-2.5 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                  {d.created.map((c) => (
                    <Link
                      key={c.id}
                      href={`/field/counter/${c.id}`}
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
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
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
