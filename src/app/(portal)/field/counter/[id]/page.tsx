import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots, users, visits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { formatISTDate } from "@/lib/date";
import { COMPETITOR_LABEL, formatDuration, isWithinEditWindow } from "@/lib/field/products";
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
    return <Notice title="Counter">You don&apos;t have Field Salesman access.</Notice>;
  }

  const { id } = await params;
  const [counter] = await db
    .select({
      id: counters.id,
      name: counters.name,
      phone: counters.phone,
      type: counters.type,
      areaName: areas.name,
      cnfName: cnfs.name,
      depotId: counters.depotId,
      depotName: depots.name,
      lat: counters.lat,
      lng: counters.lng,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .innerJoin(depots, eq(depots.id, counters.depotId))
    .innerJoin(cnfs, eq(cnfs.id, depots.cnfId))
    .where(eq(counters.id, id))
    .limit(1);
  if (!counter) notFound();

  const isAdmin = user.accessRoles.includes("admin");
  const canVisit = isAdmin || counter.depotId === user.depot?.id;

  const history = await db
    .select({
      id: visits.id,
      userId: visits.userId,
      repName: users.name,
      visitedAt: visits.visitedAt,
      items: visits.items,
      rank: visits.rank,
      competitor: visits.competitor,
      remarks: visits.remarks,
      durationSeconds: visits.durationSeconds,
    })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(eq(visits.counterId, id))
    .orderBy(desc(visits.visitedAt));

  const gps = counter.lat && counter.lng ? `${counter.lat}, ${counter.lng}` : "—";

  return (
    <div className="mx-auto max-w-2xl" style={{ animation: "fadeUp .3s ease" }}>
      <Link href="/field/beat" className="link mb-4 inline-flex">
        ← Back to beat
      </Link>

      {/* Counter details */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
              {counter.name}
            </h1>
            <span
              className="mt-2 inline-block rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: TYPE_BADGE, color: "var(--accent)" }}
            >
              {counter.type}
            </span>
          </div>
          {canVisit && (
            <Link href={`/field/counter/${counter.id}/edit`} className="btn btn-secondary btn-sm">
              Edit
            </Link>
          )}
        </div>

        <div className="mt-5 space-y-2.5 text-[14px]">
          <DetailRow k="Mobile" v={counter.phone ?? "—"} accent />
          <DetailRow k="Depot" v={counter.depotName} />
          <DetailRow k="Area/C&F" v={`${counter.areaName}, ${counter.cnfName}`} />
          <DetailRow k="GPS" v={gps} />
        </div>
      </div>

      {/* Add visit */}
      <div className="my-5">
        {canVisit ? (
          <Link
            href={`/field/counter/${counter.id}/visit`}
            className="btn btn-primary w-full justify-center py-4 text-[15px]"
          >
            Add Visit for this Counter
          </Link>
        ) : (
          <p className="card p-4 text-[13px]" style={{ color: "var(--ink-3)" }}>
            This counter is in {counter.depotName}, not your depot — you can view
            it but can&apos;t add a visit.
          </p>
        )}
      </div>

      {/* Visit history */}
      <h4 className="mb-3 text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
        Visit history ({history.length})
      </h4>

      {history.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>No visits recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((h) => {
            const editable = h.userId === user.id && isWithinEditWindow(h.visitedAt);
            return (
              <div key={h.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>
                      {formatISTDate(h.visitedAt)}
                    </div>
                    {h.durationSeconds != null && (
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        Time on counter: <span className="font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>{formatDuration(h.durationSeconds)}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Rep {h.repName}
                    </div>
                    {editable && (
                      <Link href={`/field/counter/${counter.id}/visit/${h.id}`} className="link text-[12px]">
                        Edit
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {h.items.map((it, i) => (
                    <div key={i} className="text-[13.5px]">
                      <span className="font-bold" style={{ color: "var(--accent)" }}>{it.segment}</span>{" "}
                      <span style={{ color: "var(--ink-2)" }}>Stock {it.stock} · Sold {it.sold}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
                  Deedar Rank {h.rank != null ? `#${h.rank}` : "—"}
                </div>
                <div className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                  Competitor: {h.competitor ? COMPETITOR_LABEL[h.competitor] : "—"}
                </div>
                {h.remarks && (
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>“{h.remarks}”</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="flex-none" style={{ color: "var(--ink-3)" }}>{k}:</span>
      <span className="font-semibold" style={{ color: accent ? "var(--accent)" : "var(--ink-1)" }}>{v}</span>
    </div>
  );
}
