import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { CnfPicker } from "../_components/cnf-picker";

const TREND = [12, 18, 15, 22, 19, 26, 24];
const PRODUCT_MIX = [
  { label: "DG10", pct: 38, color: "#7B2FA0" },
  { label: "DG20", pct: 27, color: "#4C8C2B" },
  { label: "DB20", pct: 21, color: "#B9812E" },
  { label: "DB40", pct: 14, color: "#128A82" },
];
const DEPOT_COLORS = ["#7B2FA0", "#4C8C2B", "#B9812E", "#128A82"];

function conic(active: number, dormant: number, declining: number) {
  const total = Math.max(1, active + dormant + declining);
  const a = Math.round((active / total) * 100);
  const d = Math.round((dormant / total) * 100);
  return {
    css: `conic-gradient(var(--success) 0% ${a}%, var(--warning) ${a}% ${a + d}%, var(--danger) ${a + d}% 100%)`,
    activePct: a,
  };
}

function trendPaths(values: number[]) {
  const w = 320, h = 110, pad = 6;
  const max = Math.max(...values);
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: pad + i * step,
    y: h - pad - (v / max) * (h - pad * 2),
  }));
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M${pts[0].x},${h} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1].x},${h} Z`;
  return { polyline, area, pts };
}

export default async function HqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cnf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.accessRoles.includes("admin");
  if (!user.accessRoles.includes("hq") && !isAdmin) {
    return <p style={{ fontSize: 14, color: "var(--ink-2)" }}>You don&apos;t have C&amp;F HQ access.</p>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs);
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <p style={{ fontSize: 14, color: "var(--ink-2)" }}>No C&amp;F HQ set up yet.</p>;
  }

  const cnfDepots = await db.select().from(depots).where(eq(depots.cnfId, selectedCnf.id));
  const depotIds = cnfDepots.map((d) => d.id);

  const counterRows = depotIds.length
    ? await db
        .select({ id: counters.id, status: counters.status, depotId: counters.depotId, name: counters.name, area: areas.name, stock: counters.stock, lastVisit: counters.lastVisitAt })
        .from(counters)
        .innerJoin(areas, eq(areas.id, counters.areaId))
        .where(inArray(counters.depotId, depotIds))
    : [];

  const activeCount = counterRows.filter((c) => c.status === "active").length;
  const dormantCount = counterRows.filter((c) => c.status === "dormant").length;
  const decliningCount = counterRows.filter((c) => c.status === "declining").length;
  const health = conic(activeCount, dormantCount, decliningCount);
  const declining = counterRows.filter((c) => c.status === "declining");

  const t = trendPaths(TREND);

  // Depot split donut
  const depotSplit = cnfDepots.map((d, i) => ({
    name: d.name,
    count: counterRows.filter((c) => c.depotId === d.id).length,
    color: DEPOT_COLORS[i % DEPOT_COLORS.length],
  }));
  const splitTotal = Math.max(1, depotSplit.reduce((s, d) => s + d.count, 0));
  const depotConicStops = depotSplit
    .map((d, i) => {
      const before = depotSplit.slice(0, i).reduce((s, x) => s + x.count, 0);
      const from = (before / splitTotal) * 100;
      const to = ((before + d.count) / splitTotal) * 100;
      return `${d.color} ${from.toFixed(1)}% ${to.toFixed(1)}%`;
    })
    .join(", ");

  const kpis = [
    { label: "Counter visibility", value: "100%", sub: "geo-tagged with owner mobile" },
    { label: "Verified time/day", value: "4.1h", sub: "avg. counter time per salesman" },
    { label: "Packets sold today", value: "35", sub: "market sales, all reps" },
    { label: "Scheme via UPI", value: "96%", sub: "zero cash disbursement" },
    { label: "Declining counters", value: String(decliningCount), sub: "flagged for revisit", danger: true },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink-2)", marginBottom: 16, flexWrap: "wrap" }}>
        <span>Headquarters (Kanpur) → {selectedCnf.name} → {cnfDepots.length} depots</span>
        {isAdmin && allCnfs.length > 1 && (
          <>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 12 }}>C&amp;F HQ</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>

      <h4 style={sectionTitle}>Overview</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 28 }}>
        {kpis.map((k) => (
          <div className="card" style={{ padding: 20 }} key={k.label}>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, color: k.danger ? "var(--danger)" : "var(--ink-1)" }}>
              {k.value}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <div className="card" style={{ padding: 20 }}>
          <h6 style={cardTitle}>Sales trend</h6>
          <p style={cardSub}>Packets sold, by date</p>
          <svg viewBox="0 0 320 110" style={{ width: "100%", height: 150 }} preserveAspectRatio="none">
            <path d={t.area} fill="var(--accent-tint)" stroke="none" />
            <polyline points={t.polyline} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            {t.pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--accent)" stroke="#fff" strokeWidth="1.2" />
            ))}
          </svg>
        </div>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <h6 style={cardTitle}>Counter health</h6>
          <p style={cardSub}>Overall health of the C&amp;F, by counter status</p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: health.css, flex: "none", position: "relative" }}>
              <div style={{ position: "absolute", inset: 16, background: "var(--bg)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
                {health.activePct}%
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              <Legend color="var(--success)" label={`Active — ${activeCount}`} />
              <Legend color="var(--warning)" label={`Dormant — ${dormantCount}`} />
              <Legend color="var(--danger)" label={`Declining — ${decliningCount}`} last />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28, alignItems: "stretch" }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <h6 style={cardTitle}>Counters by depot</h6>
          <p style={cardSub}>Coverage split, by depot</p>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: `conic-gradient(${depotConicStops})`, flex: "none" }} />
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {depotSplit.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, display: "inline-block" }} />
                  {d.name} — {d.count} ({Math.round((d.count / splitTotal) * 100)}%)
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <h6 style={cardTitle}>Product mix</h6>
          <p style={cardSub}>Packets sold MTD, by SKU</p>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {PRODUCT_MIX.map((p) => (
              <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, display: "inline-block" }} />
                {p.label} — {p.pct}%
              </div>
            ))}
          </div>
        </div>
      </div>

      <h4 style={{ ...sectionTitle, margin: "0 0 14px" }}>Declining counters ({declining.length})</h4>
      {declining.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No declining counters — healthy C&amp;F.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Counter", "Area", "Stock stuck at", "Last visit"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {declining.map((d) => (
              <tr key={d.id}>
                <td style={tdStyle}>{d.name}</td>
                <td style={tdStyle}>{d.area}</td>
                <td style={tdStyle}>{d.stock}</td>
                <td style={tdStyle}>{d.lastVisit ? new Date(d.lastVisit).toISOString().slice(0, 10) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 14px" };
const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", padding: 10, borderBottom: "1px solid var(--hairline)" };
const tdStyle: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid var(--hairline-soft)" };

function Legend({ color, label, last }: { color: string; label: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: last ? 0 : 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}
