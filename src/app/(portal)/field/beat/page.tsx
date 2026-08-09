import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

export default async function FieldBeatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.accessRoles.includes("field")) {
    return <Notice>You don&apos;t have Field Salesman access.</Notice>;
  }
  if (!user.depot || user.areas.length === 0) {
    return (
      <Notice>
        You aren&apos;t assigned to a depot and area yet — ask your supervisor
        to map you to one.
      </Notice>
    );
  }

  const areaIds = user.areas.map((a) => a.id);
  const counterList = await db
    .select({
      id: counters.id,
      name: counters.name,
      type: counters.type,
      areaName: areas.name,
    })
    .from(counters)
    .innerJoin(areas, eq(areas.id, counters.areaId))
    .where(inArray(counters.areaId, areaIds));

  const firstName = user.name.split(/\s+/)[0];
  const areaLabel = user.areas.map((a) => a.name).join(", ");

  // Day-log tracking comes later — stats are placeholders for now.
  const visitsToday = 0;
  const visitTarget = 50;
  const newCountersToday = 0;
  const newCounterTarget = 10;

  return (
    <div style={{ maxWidth: 480, animation: "fadeUp .3s ease" }}>
      <header style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 26,
            margin: "0 0 2px",
            color: "var(--ink-1)",
          }}
        >
          Namaste, {firstName}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
          {user.depot.name} · {areaLabel}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="Visits today" value={visitsToday} target={visitTarget} />
        <StatCard
          label="New counters"
          value={newCountersToday}
          target={newCounterTarget}
        />
      </div>

      <div style={{ marginBottom: 22 }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink-2)",
            display: "block",
            marginBottom: 6,
          }}
        >
          Find a counter by mobile number
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="inp"
            type="tel"
            inputMode="tel"
            maxLength={10}
            placeholder="10-digit mobile"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
            Search
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
          Found: checks you straight in. Not found: takes you to add it as a new
          counter.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h4
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 18,
            margin: 0,
            color: "var(--ink-1)",
          }}
        >
          Beat
        </h4>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {counterList.length} counter{counterList.length === 1 ? "" : "s"}
        </span>
      </div>

      {counterList.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--ink-3)" }}>
          No counters in your assigned areas yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {counterList.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid var(--hairline-soft)",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  background: "var(--bg-soft)",
                  borderRadius: "var(--r-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <PinIcon />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--ink-1)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {c.type} · {c.areaName}
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Check in</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  const pct = target === 0 ? 0 : Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 26,
          color: "var(--ink-1)",
        }}
      >
        {value}
        <span style={{ fontSize: 14, color: "var(--ink-3)" }}>/{target}</span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--hairline-soft)",
          borderRadius: "var(--r-pill)",
          marginTop: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--accent)",
            borderRadius: "var(--r-pill)",
          }}
        />
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 22,
          color: "var(--ink-1)",
        }}
      >
        Beat
      </h2>
      <p style={{ marginTop: 12, fontSize: 14, color: "var(--ink-2)" }}>{children}</p>
    </div>
  );
}
