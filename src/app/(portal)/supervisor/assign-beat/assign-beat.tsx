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
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Assign daily beat
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 18px" }}>
        Build a set of counters and hand them to a sales rep — schedule 1 day
        ahead or up to a week out.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, maxWidth: 900, marginBottom: 16 }}>
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
          <div style={{ display: "flex", gap: 2, background: "var(--bg-soft)", padding: 3, borderRadius: "var(--r-pill)" }}>
            {(["depot", "area"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                style={segStyle(scope === s)}
              >
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          className="inp"
          type="text"
          placeholder="Search counter name…"
          style={{ maxWidth: 220 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="inp" style={{ width: "auto" }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 2, background: "var(--bg-soft)", padding: 3, borderRadius: "var(--r-pill)" }}>
          {TREND_OPTIONS.map((t) => (
            <button key={t} onClick={() => setFilterTrend(t)} style={segStyle(filterTrend === t)}>
              {t === "all" ? "All trends" : t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
          {candidates.length} counters in scope · {selected.size} selected
        </span>
        <button className="link" style={{ fontSize: 13 }} onClick={toggleAll}>
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--hairline-soft)", borderRadius: "var(--r-md)", marginBottom: 16 }}>
        {candidates.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", padding: 14 }}>No counters match.</p>
        ) : (
          candidates.map((c) => {
            const ts = TREND_STYLE[c.trend];
            return (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--hairline-soft)", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.type} · {c.area}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>Stock: {c.stock}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-pill)", background: ts.bg, color: ts.color, whiteSpace: "nowrap" }}>
                  {c.trend}
                </span>
              </label>
            );
          })
        )}
      </div>

      <button className="btn btn-primary" onClick={assign} disabled={selected.size === 0}>
        Assign {selected.size} counters to {repName} — {dateLabel}
      </button>

      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "32px 0 12px" }}>
        Assignments for {dateLabel}
      </h4>
      {assignments.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No beats scheduled yet.</p>
      ) : (
        assignments.map((row, i) => (
          <div key={i} className="card" style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>{row.rep}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {row.count} counters · {row.scopeLabel} · {row.date}
              </div>
            </div>
          </div>
        ))
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
