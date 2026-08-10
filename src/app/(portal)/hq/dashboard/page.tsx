import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, cnfs, counters, depots } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveSelectedCnf } from "@/lib/hq/scope";
import { Notice } from "@/components/ui/notice";
import { LegendDot } from "@/components/ui/legend-dot";
import { StatCard } from "@/components/ui/stat-card";
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
    return <Notice title="C&F HQ">You don&apos;t have C&amp;F HQ access.</Notice>;
  }

  const { cnf: requestedCnfId } = await searchParams;
  const allCnfs = await db.select().from(cnfs);
  const selectedCnf = resolveSelectedCnf(allCnfs, requestedCnfId, user.cnf?.id ?? null, isAdmin);

  if (!selectedCnf) {
    return <Notice title="C&F HQ">No C&amp;F HQ set up yet.</Notice>;
  }

  const cnfDepots = await db.select().from(depots).where(eq(depots.cnfId, selectedCnf.id));
  const depotIds = cnfDepots.map((d) => d.id);

  const counterRows = depotIds.length
    ? await db
        .select({ id: counters.id, status: counters.status, depotId: counters.depotId, name: counters.name, area: areas.name, lastVisit: counters.lastVisitAt })
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
      <div className="mb-5 flex flex-wrap items-center gap-2.5 text-[13px]" style={{ color: "var(--ink-2)" }}>
        <span>Headquarters (Kanpur) → {selectedCnf.name} → {cnfDepots.length} depots</span>
        {isAdmin && allCnfs.length > 1 && (
          <>
            <span className="flex-1" />
            <label className="text-[12px]">C&amp;F HQ</label>
            <CnfPicker options={allCnfs} value={selectedCnf.id} />
          </>
        )}
      </div>

      <h4 className="page-title mb-4">Overview</h4>
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} sub={k.sub} danger={k.danger} />
        ))}
      </div>

      <div className="mb-4 grid items-stretch gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-5">
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
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>Counter health</h6>
          <p style={cardSub}>Overall health of the C&amp;F, by counter status</p>
          <div className="flex flex-1 items-center gap-4.5">
            <div className="relative h-24 w-24 flex-none rounded-full" style={{ background: health.css }}>
              <div
                className="absolute inset-4 flex items-center justify-center rounded-full text-[15px] font-bold"
                style={{ background: "var(--bg)", fontFamily: "var(--font-display)" }}
              >
                {health.activePct}%
              </div>
            </div>
            <div className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              <LegendDot color="var(--success)" label={`Active — ${activeCount}`} square />
              <LegendDot color="var(--warning)" label={`Dormant — ${dormantCount}`} square />
              <LegendDot color="var(--danger)" label={`Declining — ${decliningCount}`} square />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-7 grid items-stretch gap-4 sm:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>Counters by depot</h6>
          <p style={cardSub}>Coverage split, by depot</p>
          <div className="flex flex-1 items-center gap-4">
            <div className="h-[88px] w-[88px] flex-none rounded-full" style={{ background: `conic-gradient(${depotConicStops})` }} />
            <div className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              {depotSplit.map((d) => (
                <LegendDot key={d.name} color={d.color} label={`${d.name} — ${d.count} (${Math.round((d.count / splitTotal) * 100)}%)`} square />
              ))}
            </div>
          </div>
        </div>
        <div className="card flex flex-col p-5">
          <h6 style={cardTitle}>Product mix</h6>
          <p style={cardSub}>Packets sold MTD, by SKU</p>
          <div className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
            {PRODUCT_MIX.map((p) => (
              <LegendDot key={p.label} color={p.color} label={`${p.label} — ${p.pct}%`} square />
            ))}
          </div>
        </div>
      </div>

      <h4 className="page-title mb-3.5">Declining counters ({declining.length})</h4>
      {declining.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No declining counters — healthy C&amp;F.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {["Counter", "Area", "Last visit"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {declining.map((d) => (
                <tr key={d.id}>
                  <td className="font-semibold">{d.name}</td>
                  <td>{d.area}</td>
                  <td>{d.lastVisit ? new Date(d.lastVisit).toISOString().slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cardTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, margin: "0 0 4px", color: "var(--ink-1)" };
const cardSub: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" };
