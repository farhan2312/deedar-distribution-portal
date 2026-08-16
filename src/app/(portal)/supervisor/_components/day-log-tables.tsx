// Presentational (server-compatible) day-log tables shared by the Supervisor
// day-log screen and the Admin company-wide view on the field day-log page.

import { getT } from "@/lib/i18n/server";

export type DayState = "complete" | "running" | "absent";

export function dayState(startAt: Date | null, endAt: Date | null): DayState {
  if (endAt) return "complete";
  if (startAt) return "running";
  return "absent";
}

export type TodayRow = {
  key: string;
  repName: string;
  startLabel: string;
  endLabel: string;
  onJobLabel: string;
  state: DayState;
  forced: boolean;
};

export type HistoryRow = TodayRow & { dateLabel: string };

const STATE_STYLE: Record<DayState, { label: string; bg: string; color: string }> = {
  complete: { label: "Complete", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  running: { label: "Active", bg: "rgba(140,180,201,.2)", color: "#3E6B85" },
  absent: { label: "Not started", bg: "var(--bg-soft)", color: "var(--ink-3)" },
};

export async function DayLogTables({ today, history }: { today: TodayRow[]; history: HistoryRow[] }) {
  const t = await getT();
  return (
    <>
      <SectionLabel>{t("Today")}</SectionLabel>
      <div className="table-wrap mb-8">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Start time", "End time", "On Job", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {today.map((r) => (
              <tr key={r.key}>
                <td className="font-semibold">{r.repName}</td>
                <td>{r.startLabel}</td>
                <td>{r.endLabel}</td>
                <td>{r.onJobLabel}</td>
                <td>
                  <StatusChip state={r.state} forced={r.forced} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionLabel>{t("Full history — all salesmen")}</SectionLabel>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Date", "Start", "End", "On Job", "Status"].map((h) => (
                <th key={h}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-3)" }}>{t("No earlier days recorded.")}</td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.key}>
                  <td>{h.repName}</td>
                  <td>{h.dateLabel}</td>
                  <td>{h.startLabel}</td>
                  <td>{h.endLabel}</td>
                  <td>{h.onJobLabel}</td>
                  <td>
                    <StatusChip state={h.state} forced={h.forced} t={t} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusChip({
  state,
  forced,
  t,
}: {
  state: DayState;
  forced: boolean;
  t: (key: string) => string;
}) {
  const s = STATE_STYLE[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="chip" style={{ background: s.bg, color: s.color, borderColor: "transparent" }}>
        {t(s.label)}
      </span>
      {forced && (
        <span
          className="chip"
          style={{ background: "rgba(178,94,0,.12)", color: "#B25E00", borderColor: "transparent" }}
          title={t("This day was force-closed by the supervisor")}
        >
          {t("SO-closed")}
        </span>
      )}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
      {children}
    </h6>
  );
}
