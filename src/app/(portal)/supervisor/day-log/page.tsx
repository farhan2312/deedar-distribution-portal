import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui/page-header";
import { TEAM_DAY_LOG_HISTORY, TEAM_DAY_LOG_TODAY } from "@/lib/portal/mock";

export default async function SupervisorDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const depotName = user.supervisedDepots[0]?.name ?? user.depot?.name ?? "your depot";

  return (
    <div>
      <PageHeader
        title={`Day Log — ${depotName}`}
        subtitle="Visit start/end time recorded by every salesman active in this area."
      />

      <SectionLabel>Today</SectionLabel>
      <div className="table-wrap mb-8">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Start time", "End time", "On Job", "Status"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_DAY_LOG_TODAY.map((d) => (
              <tr key={d.name}>
                <td className="font-semibold">{d.name}</td>
                <td>{d.start}</td>
                <td>{d.end}</td>
                <td>{d.onJob}</td>
                <td>
                  <span className="chip" style={{ background: "rgba(30,158,90,.12)", color: "#1E9E5A", borderColor: "transparent" }}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionLabel>Full history — all salesmen</SectionLabel>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Salesman", "Date", "Start", "End", "On Job", "Status"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_DAY_LOG_HISTORY.map((h, i) => (
              <tr key={i}>
                <td>{h.name}</td>
                <td>{h.date}</td>
                <td>{h.start}</td>
                <td>{h.end}</td>
                <td>{h.onJob}</td>
                <td>{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
      {children}
    </h6>
  );
}
