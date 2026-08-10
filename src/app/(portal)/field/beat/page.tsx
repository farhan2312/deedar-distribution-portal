import { redirect } from "next/navigation";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";

export default async function FieldBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.accessRoles.includes("field")) {
    return <Notice title="Beat">You don&apos;t have Field Salesman access.</Notice>;
  }
  if (!user.depot) {
    return (
      <Notice title="Beat">
        You aren&apos;t assigned to a depot yet — ask your supervisor to map you
        to one.
      </Notice>
    );
  }

  // Beat = counters in the supervisor-assigned areas, PLUS any counter this rep
  // added themselves (so they can always visit their own additions, even if it
  // sits outside their assigned areas).
  const areaIds = user.areas.map((a) => a.id);
  const scope = areaIds.length
    ? or(inArray(counters.areaId, areaIds), eq(counters.createdByUserId, user.id))
    : eq(counters.createdByUserId, user.id);

  const rows = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      areaName: areas.name,
      createdByUserId: counters.createdByUserId,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(scope);

  const counterList = rows.map((c) => ({
    ...c,
    addedByMe: c.createdByUserId === user.id,
  }));

  const firstName = user.name.split(/\s+/)[0];
  const areaLabel = user.areas.map((a) => a.name).join(", ");
  const selfAddedCount = counterList.filter((c) => c.addedByMe).length;

  // Day-log tracking comes later — stats are placeholders for now.
  const visitsToday = 0;
  const visitTarget = 50;
  const newCountersToday = 0;
  const newCounterTarget = 10;

  return (
    <div className="mx-auto max-w-xl" style={{ animation: "fadeUp .3s ease" }}>
      <header className="mb-5">
        <h2 className="text-[26px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Namaste, {firstName}
        </h2>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {user.depot.name}
          {areaLabel && ` · ${areaLabel}`}
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <BeatStat label="Visits today" value={visitsToday} target={visitTarget} />
        <BeatStat label="New counters" value={newCountersToday} target={newCounterTarget} />
      </div>

      <div className="card mb-6 p-5">
        <label className="mb-2 block text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>
          Find a counter by mobile number
        </label>
        <div className="flex gap-2">
          <input className="inp flex-1" type="tel" inputMode="tel" maxLength={10} placeholder="10-digit mobile" />
          <button className="btn btn-primary whitespace-nowrap">Search</button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Found: checks you straight in. Not found: takes you to add it as a new
          counter.
        </p>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-[18px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Today&apos;s Beat
        </h4>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          {counterList.length} counter{counterList.length === 1 ? "" : "s"}
          {selfAddedCount > 0 && ` · ${selfAddedCount} added by you`}
        </span>
      </div>

      {counterList.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          No counters in your beat yet — add one from New Counter, or ask your
          supervisor to assign an area.
        </p>
      ) : (
        <div className="space-y-2">
          {counterList.map((c) => (
            <div key={c.id} className="card card-hover flex items-center gap-3 p-3.5">
              <div
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                style={{ background: "var(--accent-tint)" }}
              >
                <PinIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>
                    {c.name}
                  </span>
                  {c.addedByMe && (
                    <span
                      className="flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
                    >
                      Added by you
                    </span>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {c.type} · {c.areaName}
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Check in</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BeatStat({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target === 0 ? 0 : Math.round((value / target) * 100);
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {value}
        <span className="text-[14px] font-medium" style={{ color: "var(--ink-3)" }}>/{target}</span>
      </div>
      <div className="mt-2">
        <ProgressBar pct={pct} />
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
