// Mock metrics for screens whose data isn't in the DB yet (day logs, live
// tracking, analytics). Structure matches the prototype; swap for real
// queries as those features come online.

export type TeamRep = {
  name: string;
  area: string;
  status: "on-counter" | "traveling" | "idle";
  visitsToday: number;
  target: number;
  counterTimeHrs: number;
  travelHrs: number;
  idleHrs: number;
};

export const TEAM_REPS: TeamRep[] = [
  {
    name: "Hukum Chand Saini",
    area: "Karvar / Indergarh",
    status: "on-counter",
    visitsToday: 27,
    target: 50,
    counterTimeHrs: 4.6,
    travelHrs: 1.8,
    idleHrs: 0.6,
  },
  {
    name: "Sagar Rawat",
    area: "Karvar / Sumerganjmandi",
    status: "idle",
    visitsToday: 19,
    target: 50,
    counterTimeHrs: 3.1,
    travelHrs: 2.4,
    idleHrs: 1.5,
  },
];

export const STATUS_STYLE: Record<
  TeamRep["status"],
  { label: string; bg: string; color: string }
> = {
  "on-counter": { label: "On counter", bg: "rgba(30,158,90,.12)", color: "#1E9E5A" },
  traveling: { label: "Traveling", bg: "rgba(140,180,201,.2)", color: "#3E6B85" },
  idle: { label: "Idle", bg: "rgba(224,177,92,.2)", color: "#B25E00" },
};

export function splitPct(rep: TeamRep) {
  const total = Math.max(1, rep.counterTimeHrs + rep.travelHrs + rep.idleHrs);
  return {
    counterPct: Math.round((rep.counterTimeHrs / total) * 100),
    travelPct: Math.round((rep.travelHrs / total) * 100),
    idlePct: Math.round((rep.idleHrs / total) * 100),
  };
}

export const TEAM_DAY_LOG_TODAY = [
  { name: "Hukum Chand Saini", start: "09:12", end: "—", onJob: "running", status: "Active" },
  { name: "Sagar Rawat", start: "09:41", end: "—", onJob: "running", status: "Active" },
];

export const TEAM_DAY_LOG_HISTORY = [
  { name: "Hukum Chand Saini", date: "2026-08-08", start: "09:12", end: "17:48", onJob: "8h 36m", status: "Complete" },
  { name: "Sagar Rawat", date: "2026-08-08", start: "09:31", end: "18:02", onJob: "8h 31m", status: "Complete" },
  { name: "Hukum Chand Saini", date: "2026-08-07", start: "09:04", end: "17:20", onJob: "8h 16m", status: "Complete" },
  { name: "Sagar Rawat", date: "2026-08-07", start: "09:22", end: "17:55", onJob: "8h 33m", status: "Complete" },
];
