"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { istDateString } from "@/lib/date";
import { assignBeat } from "@/lib/supervisor/actions";

export type AssignCounter = {
  id: string;
  name: string;
  type: string;
  area: string;
  depotId: string;
  /** Total stock observed at this counter's most recent visit (0 if none). */
  stock: number;
  trend: "Increasing" | "Flat" | "Declining";
};
export type RepOption = { id: string; name: string; depotId: string | null };
export type AssignmentSummary = { repUserId: string; repName: string; beatDate: string; count: number };

const TREND_STYLE: Record<AssignCounter["trend"], { bg: string; color: string }> = {
  Increasing: { bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  Flat: { bg: "var(--bg-soft)", color: "var(--ink-2)" },
  Declining: { bg: "rgba(199,38,59,.1)", color: "#C7263B" },
};

const TYPE_OPTIONS = ["all", "Kirana", "Paan", "Tea Stall", "Wholesale", "Vegetable Shop", "Others"];
const TREND_OPTIONS: (AssignCounter["trend"] | "all")[] = ["all", "Increasing", "Flat", "Declining"];

function dateOptions() {
  const out: { value: string; label: string }[] = [];
  for (let i = 1; i <= 7; i++) {
    const instant = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const value = istDateString(instant);
    const label = instant.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    out.push({ value, label });
  }
  return out;
}

export function AssignBeat({
  counters,
  reps,
  initialAssignments,
}: {
  counters: AssignCounter[];
  reps: RepOption[];
  initialAssignments: AssignmentSummary[];
}) {
  const router = useRouter();
  const dates = useMemo(() => dateOptions(), []);
  const [date, setDate] = useState(dates[0].value);
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [scope, setScope] = useState<"depot" | "area">("depot");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTrend, setFilterTrend] = useState<(typeof TREND_OPTIONS)[number]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startAssign] = useTransition();

  const repDepotId = reps.find((r) => r.id === repId)?.depotId ?? null;

  // Everything below is scoped to the selected rep's depot: a beat can only
  // contain counters from the rep's own depot (assignBeat enforces the same
  // rule server-side), so the Area list is derived from those counters rather
  // than spanning every supervised depot.
  const depotCounters = useMemo(
    () => (repDepotId ? counters.filter((c) => c.depotId === repDepotId) : []),
    [counters, repDepotId],
  );
  const areaOptions = useMemo(
    () => [...new Set(depotCounters.map((c) => c.area))].sort((a, b) => a.localeCompare(b)),
    [depotCounters],
  );

  const candidates = depotCounters.filter((c) => {
    if (scope === "area" && area && c.area !== area) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterTrend !== "all" && c.trend !== filterTrend) return false;
    if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.id));
  const repName = reps.find((r) => r.id === repId)?.name ?? "";
  const dateLabel = dates.find((d) => d.value === date)?.label ?? date;
  const assignmentsForDate = initialAssignments.filter((a) => a.beatDate === date);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (candidates.every((c) => prev.has(c.id))) {
        const next = new Set(prev);
        candidates.forEach((c) => next.delete(c.id));
        return next;
      }
      const next = new Set(prev);
      candidates.forEach((c) => next.add(c.id));
      return next;
    });
  }
  function assign() {
    if (selected.size === 0 || !repId) return;
    setError(null);
    const counterIds = [...selected];
    startAssign(async () => {
      const result = await assignBeat(repId, counterIds, date);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  if (reps.length === 0) {
    return (
      <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
        No field reps in your supervised depots yet.
      </p>
    );
  }

  return (
    <div>
      <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Assign daily beat
      </h4>
      <p className="mt-0.5 mb-5 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Build a set of counters and hand them to a sales rep — schedule 1 day
        ahead or up to a week out.
      </p>

      <div className="card mb-5 p-5">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="field">
            <label>Assign for date</label>
            <select className="inp" value={date} onChange={(e) => setDate(e.target.value)}>
              {dates.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Rep</label>
            <select
              className="inp"
              value={repId}
              onChange={(e) => {
                setRepId(e.target.value);
                // Areas belong to the previous rep's depot — clear them along
                // with the selection, or the list silently filters to nothing.
                setArea("");
                setSelected(new Set());
              }}
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Scope</label>
            <div className="flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
              {(["depot", "area"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className="seg" style={segStyle(scope === s)}>
                  {s === "depot" ? "Depot" : "Area"}
                </button>
              ))}
            </div>
          </div>
          {scope === "area" && (
            <div className="field">
              <label>Area</label>
              <select className="inp" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Select area</option>
                {areaOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5" style={{ borderTop: "1px solid var(--hairline-soft)", paddingTop: 16 }}>
          <input
            className="inp"
            style={{ maxWidth: 220 }}
            type="text"
            placeholder="Search counter name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="inp w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
            ))}
          </select>
          <div className="flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--bg-soft)" }}>
            {TREND_OPTIONS.map((t) => (
              <button key={t} onClick={() => setFilterTrend(t)} style={segStyle(filterTrend === t)}>
                {t === "all" ? "All trends" : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {candidates.length} counters in scope · {selected.size} selected
        </span>
        <button className="link" onClick={toggleAll}>
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="table-wrap mb-5 max-h-[340px] overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="p-4 text-[13px]" style={{ color: "var(--ink-3)" }}>No counters match.</p>
        ) : (
          <table className="table">
            <tbody>
              {candidates.map((c) => {
                const ts = TREND_STYLE[c.trend];
                return (
                  <tr key={c.id}>
                    <td className="w-8">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td>
                      <div className="font-semibold" style={{ color: "var(--ink-1)" }}>{c.name}</div>
                      <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{c.type} · {c.area}</div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--ink-1)" }}>{c.stock}</div>
                      <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>stock</div>
                    </td>
                    <td className="text-right">
                      <span className="chip whitespace-nowrap" style={{ background: ts.bg, color: ts.color, borderColor: "transparent" }}>
                        {c.trend}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <p className="mb-3 text-[13px] font-semibold" style={{ color: "#C7263B" }}>
          {error}
        </p>
      )}

      <button className="btn btn-primary" onClick={assign} disabled={selected.size === 0 || pending}>
        {pending ? "Assigning…" : `Assign ${selected.size} counters to ${repName} — ${dateLabel}`}
      </button>

      <h4 className="mt-8 mb-3 text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Assignments for {dateLabel}
      </h4>
      {assignmentsForDate.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No beats scheduled yet.</p>
      ) : (
        <div className="space-y-2.5">
          {assignmentsForDate.map((row) => (
            <div key={`${row.repUserId}__${row.beatDate}`} className="card flex items-center justify-between p-4">
              <div>
                <div className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{row.repName}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {row.count} counter{row.count === 1 ? "" : "s"} · {dateLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function segStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    border: "none",
    padding: "9px 12px",
    borderRadius: "var(--r-pill)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--ink-2)",
  };
}
