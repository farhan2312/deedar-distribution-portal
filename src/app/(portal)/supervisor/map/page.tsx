import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, counters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { durationLabel, formatISTTime, istDateString, istDayBounds } from "@/lib/date";
import {
  getCountersVisitedToday,
  getScopeDepots,
  getTeamDayLogs,
  getTeamReps,
  getVisitsToday,
  pickDepot,
} from "@/lib/supervisor/team";
import { canAccess } from "@/lib/auth/access";
import { LegendDot } from "@/components/ui/legend-dot";
import { Notice } from "@/components/ui/notice";
import { DepotPicker } from "../_components/depot-picker";

type RepStatus = "done" | "active" | "idle" | "off";
const STATUS_STYLE: Record<RepStatus, { label: string; bg: string; color: string }> = {
  done: { label: "Day closed", bg: "rgba(140,180,201,.2)", color: "#3E6B85" },
  active: { label: "On counter", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  idle: { label: "Idle", bg: "rgba(224,177,92,.2)", color: "#B25E00" },
  off: { label: "Not started", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

const STATUS_PIN: Record<string, string> = {
  active: "var(--ink-3)",
  dormant: "var(--ink-3)",
  declining: "#C7263B",
};

// Deterministic scatter fallback for counters with no GPS.
function pinPos(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return { top: 10 + (h % 78), left: 6 + ((h >> 3) % 86) };
}

export default async function SupervisorMapPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "supervisor")) {
    return <Notice title="Live map">You don&apos;t have Supervisor access.</Notice>;
  }

  const { depot: requestedDepot } = await searchParams;
  const depots = await getScopeDepots(user);
  const depot = pickDepot(depots, requestedDepot);
  const depotIds = depot ? [depot.id] : depots.map((d) => d.id);

  const reps = await getTeamReps(user, depot?.id);
  const repIds = reps.map((r) => r.id);
  const today = istDateString();
  const bounds = istDayBounds();

  const [dayLogs, visitMap, visitedCounterIds, counterRows] = await Promise.all([
    getTeamDayLogs(repIds, today),
    getVisitsToday(repIds, bounds),
    getCountersVisitedToday(repIds, bounds),
    depotIds.length
      ? db
          .select({ id: counters.id, name: counters.name, status: counters.status, area: areas.name, lat: counters.lat, lng: counters.lng })
          .from(counters)
          .innerJoin(areas, eq(areas.id, counters.areaId))
          .where(inArray(counters.depotId, depotIds))
      : Promise.resolve([]),
  ]);

  // Build a normalizer from all counter GPS so pins and rep markers share space.
  const geo = counterRows
    .map((c) => ({ id: c.id, lat: c.lat ? Number(c.lat) : null, lng: c.lng ? Number(c.lng) : null }))
    .filter((c) => c.lat != null && c.lng != null) as { id: string; lat: number; lng: number }[];
  const project = makeProjector(geo);

  const pins = counterRows.map((c) => {
    const lat = c.lat ? Number(c.lat) : null;
    const lng = c.lng ? Number(c.lng) : null;
    const pos = lat != null && lng != null && project ? project(lat, lng) : pinPos(c.id);
    return { ...c, ...pos, visited: visitedCounterIds.has(c.id) };
  });

  const repRows = reps.map((r) => {
    const v = visitMap.get(r.id);
    const log = dayLogs.get(r.id);
    const status = repStatus(log?.startAt ?? null, log?.endAt ?? null, (v?.count ?? 0) > 0);
    const last = v?.last ?? null;
    const lat = last?.lat ? Number(last.lat) : null;
    const lng = last?.lng ? Number(last.lng) : null;
    const marker = lat != null && lng != null && project ? project(lat, lng) : null;
    return {
      id: r.id,
      name: r.name,
      status,
      area: last?.area ?? r.depotName ?? "—",
      visits: v?.count ?? 0,
      counters: v?.counters ?? 0,
      lastLabel: last ? `${last.counterName} · ${formatISTTime(last.visitedAt)}` : "—",
      onJob: durationLabel(log?.startAt ?? null, log?.endAt ?? new Date()),
      started: !!log?.startAt,
      marker,
    };
  });

  const scopeLabel = depot?.name ?? (depots.length > 1 ? "all depots" : depots[0]?.name ?? "your depot");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Team today — {scopeLabel}
        </h4>
        {depots.length > 1 && <DepotPicker options={depots} value={depot?.id ?? "all"} />}
      </div>

      {reps.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>No field reps report to you{depot ? " in this depot" : ""} yet.</p>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {repRows.map((r) => {
            const st = STATUS_STYLE[r.status];
            return (
              <div className="card p-4" key={r.id}>
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>{r.name}</div>
                  <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>{st.label}</span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {r.area} · {r.visits} visits · {r.counters} counters
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-4">
        <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {scopeLabel} — counter map
        </h4>
        <div className="flex items-center gap-3.5">
          <LegendDot color="var(--success)" label="Visited today" />
          <LegendDot color="var(--ink-3)" label="Pending" />
          <LegendDot color="var(--danger)" label="Declining" />
          <LegendDot color="#2E5FA3" label="Rep (last visit)" />
        </div>
      </div>

      {/* Stylized street map — pins placed by real GPS where available */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border"
        style={{ aspectRatio: "21 / 9", background: "#EEF3EC", borderColor: "var(--hairline-soft)", boxShadow: "var(--shadow-sm)" }}
      >
        {[
          { top: "6%", left: "4%", w: "26%", h: "24%" },
          { top: "6%", left: "33%", w: "22%", h: "24%" },
          { top: "6%", left: "80%", w: "16%", h: "12%" },
          { top: "44%", left: "4%", w: "30%", h: "22%" },
          { top: "44%", left: "38%", w: "20%", h: "22%" },
          { top: "44%", left: "76%", w: "20%", h: "22%" },
          { top: "80%", left: "4%", w: "30%", h: "14%" },
        ].map((b, i) => (
          <div key={i} className="absolute rounded-[10px]" style={{ top: b.top, left: b.left, width: b.w, height: b.h, background: "#E1EBDD" }} />
        ))}

        {pins.map((p) => (
          <div key={p.id} title={`${p.name} · ${p.area}`} className="absolute" style={{ top: `${p.top}%`, left: `${p.left}%`, transform: "translate(-50%,-50%)" }}>
            <div
              className="h-[20px] w-[20px] rounded-full border-2 border-white"
              style={{ background: p.visited ? "var(--success)" : STATUS_PIN[p.status] ?? "var(--ink-3)", boxShadow: "var(--shadow-sm)" }}
            />
          </div>
        ))}

        {/* Rep markers at their most recent visit location */}
        {repRows.filter((r) => r.marker).map((r) => (
          <div key={r.id} className="absolute z-20 flex items-center gap-1.5" style={{ top: `${r.marker!.top}%`, left: `${r.marker!.left}%`, transform: "translate(-50%,-50%)" }}>
            <div className="h-6 w-6 flex-none rounded-full border-2 border-white" style={{ background: "#2E5FA3", boxShadow: "var(--shadow-md)" }} />
            <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ color: "#2E5FA3", background: "rgba(255,255,255,.85)" }}>
              {r.name.split(/\s+/)[0]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        Every geo-tagged counter is plotted; a rep&apos;s marker sits at their
        latest visit today (their last confirmed location — live GPS isn&apos;t tracked).
      </p>

      {/* Live team table */}
      <h6 className="mt-7 mb-3 text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Live team — status for the day
      </h6>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Status", "Visits", "Last seen", "Counter hrs"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-3)" }}>No reps report to you yet.</td>
              </tr>
            ) : (
              repRows.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.name}</td>
                    <td>
                      <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>{st.label}</span>
                    </td>
                    <td>{r.visits}</td>
                    <td>{r.lastLabel}</td>
                    <td>{r.started ? r.onJob : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function repStatus(startAt: Date | null, endAt: Date | null, visitedToday: boolean): RepStatus {
  if (endAt) return "done";
  if (!startAt) return "off";
  return visitedToday ? "active" : "idle";
}

/** Maps lat/lng into top/left % across the stylized map (north up). Returns null with <2 points. */
function makeProjector(points: { lat: number; lng: number }[]) {
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const dLat = maxLat - minLat || 1;
  const dLng = maxLng - minLng || 1;
  return (lat: number, lng: number) => ({
    top: 8 + ((maxLat - lat) / dLat) * 84,
    left: 6 + ((lng - minLng) / dLng) * 88,
  });
}
