import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  cnfs,
  counters,
  stockists,
  users,
  visits,
  counterStatusEnum,
  type ProductSegment,
  type VisitItem,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { competitorDisplayLabel, formatDuration, PRODUCT_SEGMENTS } from "@/lib/field/products";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";
import { UrlPagination } from "@/components/ui/url-pagination";

/** Visits per page — the same 25 the ISR detail table uses. */
const VISITS_PER_PAGE = 25;

type CounterStatus = (typeof counterStatusEnum.enumValues)[number];

const STATUS_STYLE: Record<CounterStatus, { label: string; bg: string; color: string }> = {
  active: { label: "Active", bg: "rgba(30,158,90,.12)", color: "var(--success)" },
  dormant: { label: "Dormant", bg: "rgba(178,94,0,.12)", color: "var(--warning)" },
  declining: { label: "Declining", bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
};

const SEGMENT_COLOR: Record<ProductSegment, string> = {
  DG10: "#7B2FA0",
  DG20: "#4C8C2B",
  DB20: "#B9812E",
  DB40: "#128A82",
};

const KIND_LABEL = { depot: "Depot", dealer: "Dealer", sub_dealer: "Sub-Dealer" } as const;

/** Clock read through a helper — a literal `new Date()` in the component body
 * trips the `react-hooks/purity` lint even in a Server Component. */
function nowInstant(): Date {
  return new Date();
}

/**
 * One counter, whole: who owns it, where it sits, and every visit ever
 * recorded against it.
 *
 * Its own route rather than a link to `/field/counter/[id]`: that page is
 * gated on the Field ISR role and exists to check in, so a Kanpur HQ viewer
 * following a link out of Reports would have been turned away by the guard.
 * This one is read-only and gated on the same access Reports itself needs.
 */
export default async function KhqCounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vpage?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  if (!canAccess(user, "khq")) {
    return <Notice title={t("Counter")}>{t("You don't have Kanpur HQ access.")}</Notice>;
  }

  const { id } = await params;
  const sp = await searchParams;
  const askedPage = Math.max(1, Number.parseInt(sp.vpage ?? "1", 10) || 1);

  const creator = alias(users, "creator");
  const parentStockist = alias(stockists, "parent_stockist");

  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      typeOther: counters.typeOther,
      status: counters.status,
      address: counters.address,
      lat: counters.lat,
      lng: counters.lng,
      createdAt: counters.createdAt,
      lastVisitAt: counters.lastVisitAt,
      areaName: areas.name,
      stockistName: stockists.name,
      stockistKind: stockists.kind,
      parentName: parentStockist.name,
      cnfName: cnfs.name,
      createdByName: creator.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .leftJoin(parentStockist, eq(parentStockist.id, stockists.parentId))
    .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
    .leftJoin(creator, eq(creator.id, counters.createdByUserId))
    .where(eq(counters.id, id))
    .limit(1);

  if (!counter) notFound();

  const onCounter = eq(visits.counterId, id);

  // Totals over every visit, the SKU split, and one page of rows — the same
  // split as the ISR page: paging the rows must not turn "packets sold" into
  // "packets sold on this page".
  const [agg, itemRows, competitorRows] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        packets: sql<number>`coalesce(sum(${visits.sold}), 0)::int`,
        reps: sql<number>`count(distinct ${visits.userId})::int`,
        avgRank: sql<number>`coalesce(avg(${visits.rank}), 0)::float`,
        // See the note in lib/audit/data.ts: without the column's mapper this
        // comes back as a string, and `formatISTDate` then renders it as
        // "Invalid Date" rather than failing loudly.
        firstAt: sql<Date | null>`min(${visits.visitedAt})`.mapWith(visits.visitedAt),
        days: sql<number>`count(distinct (${visits.visitedAt} AT TIME ZONE 'Asia/Kolkata')::date)::int`,
      })
      .from(visits)
      .where(onCounter),
    db.select({ items: visits.items }).from(visits).where(onCounter),
    db
      .select({ competitor: visits.competitor, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(onCounter, sql`${visits.competitor} is not null`))
      .groupBy(visits.competitor)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const total = agg[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / VISITS_PER_PAGE));
  const page = Math.min(askedPage, totalPages);

  const visitRows = await db
    .select({
      id: visits.id,
      visitedAt: visits.visitedAt,
      sold: visits.sold,
      stock: visits.stock,
      rank: visits.rank,
      competitor: visits.competitor,
      competitorBrand: visits.competitorBrand,
      remarks: visits.remarks,
      durationSeconds: visits.durationSeconds,
      repName: users.name,
    })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(onCounter)
    // The id makes the sort total, so no visit is dropped or repeated across a
    // page boundary when two share a timestamp.
    .orderBy(desc(visits.visitedAt), asc(visits.id))
    .limit(VISITS_PER_PAGE)
    .offset((page - 1) * VISITS_PER_PAGE);

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

  const packets = agg[0]?.packets ?? 0;
  const avgRank = agg[0]?.avgRank ?? 0;
  const firstAt = agg[0]?.firstAt ?? null;
  const daysCovered = agg[0]?.days ?? 0;
  const topCompetitor = competitorRows.find((c) => c.competitor && c.competitor !== "none") ?? null;

  const status = STATUS_STYLE[counter.status];
  const daysSinceVisit =
    counter.lastVisitAt == null
      ? null
      : Math.floor((nowInstant().getTime() - counter.lastVisitAt.getTime()) / 86_400_000);

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Header */}
      <div className="mb-5">
        <Link href="/khq/reports" className="link text-[12.5px]">
          {t("← Back to reports")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="page-title">{counter.name}</h1>
          <span
            className="chip"
            style={{ background: status.bg, color: status.color, borderColor: "transparent" }}
          >
            {t(status.label)}
          </span>
          <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)", borderColor: "transparent" }}>
            {t(counterTypeLabel(counter.type, counter.typeOther))}
          </span>
        </div>
        <p className="page-subtitle">
          {counter.areaName} · {counter.stockistName} · {counter.cnfName}
          {counter.phone ? ` · ${counter.phone}` : ""}
        </p>
      </div>

      {/* Lifetime figures */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Tile label={t("Packets sold")} value={packets.toLocaleString("en-IN")} tint="#7B2FA0" accent />
        <Tile label={t("Visits")} value={String(total)} tint="#2E9E5A" />
        <Tile label={t("Days visited")} value={String(daysCovered)} tint="#128A82" />
        <Tile label={t("ISRs")} value={String(agg[0]?.reps ?? 0)} tint="#2E5FA3" />
        <Tile
          label={t("Avg Deedar rank")}
          value={avgRank > 0 ? avgRank.toFixed(1) : "—"}
          tint="#B9812E"
        />
        <Tile
          label={t("Last visit")}
          value={
            daysSinceVisit == null
              ? t("Never")
              : daysSinceVisit === 0
                ? t("Today")
                : `${daysSinceVisit}${t("d ago")}`
          }
          tint={daysSinceVisit == null || daysSinceVisit >= 14 ? "#C7263B" : "#6B7280"}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Details */}
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Details")}
          </h2>
          <dl className="flex flex-col">
            <Row label={t("Mobile")} value={counter.phone ?? "—"} mono />
            <Row label={t("Type")} value={t(counterTypeLabel(counter.type, counter.typeOther))} />
            <Row label={t("Area")} value={counter.areaName} />
            <Row
              label={t(KIND_LABEL[counter.stockistKind])}
              value={
                counter.parentName ? `${counter.stockistName} · ${counter.parentName}` : counter.stockistName
              }
            />
            <Row label={t("C&F HQ")} value={counter.cnfName} />
            <Row label={t("Address")} value={counter.address?.trim() || "—"} />
            <Row
              label={t("GPS")}
              value={
                counter.lat && counter.lng ? (
                  // Opens the pin in whatever map app the viewer has.
                  <a
                    className="link tabular-nums"
                    href={`https://www.google.com/maps/search/?api=1&query=${counter.lat},${counter.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {Number(counter.lat).toFixed(5)}, {Number(counter.lng).toFixed(5)}
                  </a>
                ) : (
                  <span style={{ color: "var(--warning)" }}>{t("Not captured")}</span>
                )
              }
            />
            <Row label={t("Added by")} value={counter.createdByName ?? "—"} />
            <Row label={t("Added on")} value={formatISTDate(counter.createdAt)} />
            <Row
              label={t("First visit")}
              value={firstAt ? formatISTDate(firstAt) : t("Never")}
            />
            <Row
              label={t("Competitor")}
              value={
                topCompetitor
                  ? `${t(competitorDisplayLabel(topCompetitor.competitor, null))} · ${topCompetitor.n} ${t(
                      topCompetitor.n === 1 ? "sighting" : "sightings",
                    )}`
                  : t("None seen")
              }
            />
          </dl>
        </section>

        {/* SKU split */}
        <section className="card p-5">
          <h2 className="mb-1 text-[15px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            {t("Packets sold, by SKU")}
          </h2>
          <p className="mb-4 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {t("Across every visit to this counter")}
          </p>
          {packets === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("Nothing sold here yet.")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {PRODUCT_SEGMENTS.map((p) => {
                const n = bySegment.get(p.value) ?? 0;
                const pct = packets > 0 ? Math.round((n / packets) * 100) : 0;
                return (
                  <div key={p.value} className="flex items-center gap-3">
                    <span className="w-14 flex-none text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
                      {p.label}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: SEGMENT_COLOR[p.value] }}
                      />
                    </div>
                    <span className="w-24 flex-none text-right text-[12px]" style={{ color: "var(--ink-3)" }}>
                      <b className="tabular-nums" style={{ color: "var(--ink-1)" }}>{n.toLocaleString("en-IN")}</b>
                      {" · "}
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Visit history */}
      <section className="card overflow-hidden p-0">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--hairline-soft)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {t("Visit history")}
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
              {t("Every visit recorded at this counter")}
            </p>
          </div>
          <span
            className="chip flex-none"
            style={{ background: "var(--bg-soft)", color: "var(--ink-3)", borderColor: "transparent" }}
          >
            {total}
          </span>
        </div>

        {total === 0 ? (
          <p className="px-5 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("No visits recorded at this counter yet.")}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {["Date", "Time", "ISR", "Sold", "Stock", "Rank", "Competitor", "On counter", "Remarks"].map((h) => (
                      <th key={h}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visitRows.map((v) => (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap">{formatISTDate(v.visitedAt)}</td>
                      <td className="whitespace-nowrap tabular-nums">{formatISTTime(v.visitedAt)}</td>
                      <td className="font-semibold">{v.repName}</td>
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
                      <td style={{ color: "var(--ink-3)" }}>{v.remarks?.trim() || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 pb-3">
                <UrlPagination page={page} totalPages={totalPages} param="vpage" />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  tint,
  accent,
}: {
  label: string;
  value: string;
  tint: string;
  accent?: boolean;
}) {
  return (
    <div
      className="card px-4 py-3"
      style={accent ? { borderColor: tint, boxShadow: `inset 3px 0 0 ${tint}` } : undefined}
    >
      <div className="truncate text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-[22px] font-bold leading-tight tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: accent ? tint : "var(--ink-1)" }}
      >
        {value}
      </div>
    </div>
  );
}

/** A definition row. Hairlines between rather than around, so the list reads
 * as one block instead of a stack of boxes. */
function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-2"
      style={{ borderBottom: "1px solid var(--hairline-soft)" }}
    >
      <dt className="flex-none text-[12px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd
        className={`min-w-0 text-right text-[13px] ${mono ? "tabular-nums" : ""}`}
        style={{ color: "var(--ink-1)" }}
      >
        {value}
      </dd>
    </div>
  );
}
