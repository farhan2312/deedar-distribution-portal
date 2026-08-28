import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, stockists, users, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate, formatISTTime } from "@/lib/date";
import { findTodaysVisit } from "@/lib/field/visit-day";
import {
  competitorDisplayLabel,
  editableVisitCutoff,
  editWindowRemaining,
  formatDuration,
  isWithinEditWindow,
} from "@/lib/field/products";
import { counterTypeLabel } from "@/lib/field/counter-types";
import { getT } from "@/lib/i18n/server";
import { Notice } from "@/components/ui/notice";

const TYPE_BADGE = "rgba(178,142,46,.14)";

export default async function CounterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    const t = await getT();
    return <Notice title={t("Counter")}>{t("You don't have Field Salesman ISR access.")}</Notice>;
  }
  const t = await getT();

  const { id } = await params;
  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      typeOther: counters.typeOther,
      areaName: areas.name,
      cnfName: cnfs.name,
      stockistId: counters.stockistId,
      stockistName: stockists.name,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(stockists, eq(stockists.id, counters.stockistId))
    .innerJoin(cnfs, eq(cnfs.id, stockists.cnfId))
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const isAdmin = user.accessRoles.includes("admin");
  const canVisit = isAdmin || counter.stockistId === user.depot?.id;

  // The history list is "editable visits" only, for everyone — visits from
  // before today's midnight cutoff never appear here, not even for admin. A
  // field rep is further scoped to their OWN visits; admin sees every rep's
  // today, since admin can edit any of them within the window.
  const historyWhere = isAdmin
    ? and(eq(visits.counterId, id), gte(visits.visitedAt, editableVisitCutoff()))
    : and(
        eq(visits.counterId, id),
        eq(visits.userId, user.id),
        gte(visits.visitedAt, editableVisitCutoff()),
      );

  const history = await db
    .select({
      id: visits.id,
      userId: visits.userId,
      repName: users.name,
      visitedAt: visits.visitedAt,
      items: visits.items,
      rank: visits.rank,
      competitor: visits.competitor,
      competitorBrand: visits.competitorBrand,
      remarks: visits.remarks,
      durationSeconds: visits.durationSeconds,
    })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(historyWhere)
    .orderBy(desc(visits.visitedAt));

  const gps = counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : "—";
  // Only meaningful while something on screen is still editable.
  const hasEditable = history.some(
    (h) => (h.userId === user.id || isAdmin) && isWithinEditWindow(h.visitedAt),
  );
  const timeLeft = hasEditable ? editWindowRemaining() : null;

  // Deliberately a separate lookup rather than reading `history`: for a rep
  // that list is scoped to their OWN visits, so a colleague's call on this
  // counter today would be invisible in it — and a colleague's call is exactly
  // what has to block the button. Admin is exempt from the one-a-day rule.
  const todaysVisit = isAdmin ? null : await findTodaysVisit(user.id, id);
  const ownVisitToday = todaysVisit?.isOwn ? todaysVisit : null;
  const otherVisitToday = todaysVisit && !todaysVisit.isOwn ? todaysVisit : null;

  return (
    <div className="mx-auto max-w-2xl" style={{ animation: "fadeUp .3s ease" }}>
      <Link href="/field/beat" className="link mb-4 inline-flex">
        {t("← Back to beat")}
      </Link>

      {/* Counter details */}
      <div className="card relative overflow-hidden p-6">
        {/* Decorative map pin, echoing the counter's location. Hidden on small
            screens so it never competes with the details for space. */}
        <MapArt className="pointer-events-none absolute right-4 top-1/2 hidden h-[170px] w-[210px] -translate-y-1/2 opacity-70 md:block" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {counter.name}
            </h1>
            <span
              className="mt-2 inline-block rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: TYPE_BADGE, color: "var(--accent)" }}
            >
              {counterTypeLabel(counter.type, counter.typeOther)}
            </span>
          </div>
          {canVisit && (
            <Link href={`/field/counter/${counter.id}/edit`} className="btn btn-secondary btn-sm relative">
              <PencilIcon className="h-3.5 w-3.5" />
              {t("Edit")}
            </Link>
          )}
        </div>

        <div className="relative mt-5 flex flex-col gap-3 md:max-w-[62%]">
          <DetailRow icon={<PhoneIcon className="h-4 w-4" />} k={t("Mobile")} v={counter.phone ?? "—"} accent />
          <DetailRow icon={<StoreIcon className="h-4 w-4" />} k={t("Stockist")} v={counter.stockistName} />
          <DetailRow icon={<PinIcon className="h-4 w-4" />} k={t("Area/C&F")} v={`${counter.areaName}, ${counter.cnfName}`} />
          <DetailRow icon={<TargetIcon className="h-4 w-4" />} k={t("GPS")} v={gps} />
        </div>
      </div>

      {/* Add visit */}
      <div className="my-5">
        {canVisit && otherVisitToday ? (
          <p className="card p-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
            <strong style={{ color: "var(--ink-2)" }}>{otherVisitToday.userName}</strong>{" "}
            {t("visited this counter today at")} {formatISTTime(otherVisitToday.visitedAt)}.{" "}
            {t("A counter is visited once a day.")}
          </p>
        ) : canVisit ? (
          // A counter is called on once per day, so once today's visit exists
          // this becomes an edit link rather than offering a duplicate.
          <Link
            href={
              ownVisitToday
                ? `/field/counter/${counter.id}/visit/${ownVisitToday.id}`
                : `/field/counter/${counter.id}/visit`
            }
            // .btn-primary (not the fixed --gradient-cosmic brand-green) so this
            // follows the field section's own accent, same as every other
            // primary button in the app.
            className="btn btn-primary w-full justify-center gap-2.5 py-4 text-[15px]"
          >
            <CalendarIcon className="h-[18px] w-[18px]" />
            {ownVisitToday ? t("Edit today's visit") : t("Add Visit for this Counter")}
            <span aria-hidden className="ml-1">→</span>
          </Link>
        ) : (
          <p className="card p-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("This counter is in")} {counter.stockistName}
            {t(", not your stockist — you can view it but can't add a visit.")}
          </p>
        )}
      </div>

      {/* Visit history */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h4
          className="inline-block pb-1.5 text-[13px] font-bold uppercase tracking-wider"
          style={{ color: "var(--ink-2)", borderBottom: "2px solid var(--accent)" }}
        >
          {t("Visit history")} ({history.length})
        </h4>
        {timeLeft && (
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            {t("Today's visits editable for")}{" "}
            <strong style={{ color: "var(--warning)" }}>{timeLeft}</strong> — {t("until 11:59 PM")}
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          {t("No editable visits — visits drop off here once the day ends.")}
        </p>
      ) : (
        <div className="space-y-3">
          {history.map((h) => {
            // Reps edit their own; admin can correct anyone's. Either way only
            // until the day's midnight lock.
            const editable = (h.userId === user.id || isAdmin) && isWithinEditWindow(h.visitedAt);
            return (
              <div key={h.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IconTile>
                      <CalendarIcon className="h-[18px] w-[18px]" style={{ color: "var(--accent)" }} />
                    </IconTile>
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>
                        {formatISTDate(h.visitedAt)}
                      </div>
                      {h.durationSeconds != null && (
                        <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {t("Time on counter:")}{" "}
                          <span className="font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>
                            {formatDuration(h.durationSeconds)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}
                    >
                      <UserIcon className="h-3.5 w-3.5" />
                      {t("Rep")} {h.repName}
                    </span>
                    {editable && (
                      <Link href={`/field/counter/${counter.id}/visit/${h.id}`} className="btn btn-secondary btn-sm">
                        <PencilIcon className="h-3.5 w-3.5" />
                        {t("Edit")}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {h.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-xl p-3" style={{ background: "var(--bg-soft)" }}>
                      <IconTile small>
                        <BagIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />
                      </IconTile>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-bold" style={{ color: "var(--accent)" }}>{it.segment}</div>
                        <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Stock")} {it.stock}</div>
                        <div
                          className="text-[12px] font-semibold"
                          style={{ color: it.sold > 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {t("Sold")} {it.sold}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <StatTile
                    icon={<StarIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
                    label={t("Deedar Rank")}
                    value={h.rank != null ? `#${h.rank}` : "—"}
                  />
                  <StatTile
                    icon={<UsersIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />}
                    label={t("Competitor")}
                    value={h.competitor ? t(competitorDisplayLabel(h.competitor, h.competitorBrand)) : "—"}
                  />
                </div>

                {h.remarks && (
                  <p className="mt-2.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>“{h.remarks}”</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Rounded accent-tinted square holding a small icon. */
function IconTile({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-xl ${small ? "h-8 w-8" : "h-10 w-10"}`}
      style={{ background: "var(--accent-tint)" }}
    >
      {children}
    </span>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-3" style={{ background: "var(--bg-soft)" }}>
      <IconTile small>{icon}</IconTile>
      <div className="min-w-0">
        <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{label}</div>
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>{value}</div>
      </div>
    </div>
  );
}

function DetailRow({ icon, k, v, accent }: { icon: React.ReactNode; k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <IconTile small>
        <span style={{ color: "var(--accent)" }}>{icon}</span>
      </IconTile>
      <span className="flex-none text-[13.5px]" style={{ color: "var(--ink-3)" }}>{k}:</span>
      <span className="text-[14.5px] font-semibold" style={{ color: accent ? "var(--accent)" : "var(--ink-1)" }}>
        {v}
      </span>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────
type IconProps = { className?: string; style?: React.CSSProperties };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PhoneIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}
function StoreIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M3 9V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4M3 9h18M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
      <path d="M9 13h6" />
    </svg>
  );
}
function PinIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function TargetIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </svg>
  );
}
function CalendarIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
function PencilIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function UserIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function UsersIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function BagIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" {...stroke}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function StarIcon(p: IconProps) {
  return (
    <svg {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7L6 21l1.6-7-5.4-4.7 7.1-.7Z" />
    </svg>
  );
}

/** Flat map-pin illustration — decorative only, tinted from the role accent so
 * it recolours with the section theme. */
function MapArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 210 170" fill="none" aria-hidden>
      <ellipse cx="105" cy="120" rx="78" ry="34" stroke="var(--accent)" strokeOpacity=".28" strokeWidth="2" />
      <ellipse cx="105" cy="120" rx="46" ry="19" fill="var(--accent)" fillOpacity=".08" />
      <path
        d="M105 30c14.4 0 26 11.6 26 26 0 19.5-26 46-26 46s-26-26.5-26-46c0-14.4 11.6-26 26-26Z"
        fill="var(--accent)"
        fillOpacity=".55"
      />
      <circle cx="105" cy="55" r="10" fill="var(--surface)" />
      <circle cx="40" cy="46" r="3" fill="var(--accent)" fillOpacity=".45" />
      <circle cx="176" cy="62" r="2.5" fill="var(--accent)" fillOpacity=".4" />
      <circle cx="166" cy="24" r="2" fill="var(--accent)" fillOpacity=".35" />
    </svg>
  );
}
