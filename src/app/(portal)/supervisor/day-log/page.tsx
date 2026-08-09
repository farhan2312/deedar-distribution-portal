import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { TEAM_DAY_LOG_HISTORY, TEAM_DAY_LOG_TODAY } from "@/lib/portal/mock";

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  padding: 10,
  borderBottom: "1px solid var(--hairline)",
};
const td: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid var(--hairline-soft)",
};

export default async function SupervisorDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const depotName = user.supervisedDepots[0]?.name ?? user.depot?.name ?? "your depot";

  return (
    <div>
      <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
        Day Log — {depotName}
      </h4>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
        Visit start/end time recorded by every salesman active in this area.
      </p>

      <SectionLabel>Today</SectionLabel>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 24 }}>
        <thead>
          <tr>
            {["Salesman", "Start time", "End time", "On Job", "Status"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TEAM_DAY_LOG_TODAY.map((d) => (
            <tr key={d.name}>
              <td style={{ ...td, fontWeight: 600 }}>{d.name}</td>
              <td style={td}>{d.start}</td>
              <td style={td}>{d.end}</td>
              <td style={td}>{d.onJob}</td>
              <td style={td}>
                <span style={pill("rgba(30,158,90,.12)", "#1E9E5A")}>{d.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionLabel>Full history — all salesmen</SectionLabel>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Salesman", "Date", "Start", "End", "On Job", "Status"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TEAM_DAY_LOG_HISTORY.map((h, i) => (
            <tr key={i}>
              <td style={{ ...td, padding: 10 }}>{h.name}</td>
              <td style={{ ...td, padding: 10 }}>{h.date}</td>
              <td style={{ ...td, padding: 10 }}>{h.start}</td>
              <td style={{ ...td, padding: 10 }}>{h.end}</td>
              <td style={{ ...td, padding: 10 }}>{h.onJob}</td>
              <td style={{ ...td, padding: 10 }}>{h.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h6 style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
      {children}
    </h6>
  );
}

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-pill)", background: bg, color };
}
