"use client";

import { useMemo, useState } from "react";

export type AssignCounter = {
  id: string;
  name: string;
  type: string;
  area: string;
  stock: number;
  trend: "Increasing" | "Flat" | "Declining";
};
export type RepOption = { id: string; name: string };

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
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    out.push({ value, label });
  }
  return out;
}

export function AssignBeat({
  counters,
  reps,
  areaOptions,
}: {
  counters: AssignCounter[];
  reps: RepOption[];
  areaOptions: string[];
}) {
  const dates = useMemo(() => dateOptions(), []);
  const [date, setDate] = useState(dates[0].value);
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [scope, setScope] = useState<"depot" | "area">("depot");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTrend, setFilterTrend] = useState<(typeof TREND_OPTIONS)[number]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<
    { rep: string; count: number; scopeLabel: string; date: string }[]
  >([]);

  const candidates = counters.filter((c) => {
    if (scope === "area" && area && c.area !== area) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterTrend !== "all" && c.trend !== filterTrend) return false;
    if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.id));
  const repName = reps.find((r) => r.id === repId)?.name ?? "";
  const dateLabel = dates.find((d) => d.value === date)?.label ?? date;

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
    if (selected.size === 0) return;
    setAssignments((prev) => [
      { rep: repName, count: selected.size, scopeLabel: scope === "area" ? `Area: ${area}` : "Whole depot", date: dateLabel },
      ...prev,
    ]);
    setSelected(new Set());
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
            <select className="inp" value={repId} onChange={(e) => setRepId(e.target.value)}>
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
                    <td className="text-right whitespace-nowrap">Stock: {c.stock}</td>
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

      <button className="btn btn-primary" onClick={assign} disabled={selected.size === 0}>
        Assign {selected.size} counters to {repName} — {dateLabel}
      </button>

      <h4 className="mt-8 mb-3 text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Assignments for {dateLabel}
      </h4>
      {assignments.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No beats scheduled yet.</p>
      ) : (
        <div className="space-y-2.5">
          {assignments.map((row, i) => (
            <div key={i} className="card flex items-center justify-between p-4">
              <div>
                <div className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{row.rep}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {row.count} counters · {row.scopeLabel} · {row.date}
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
