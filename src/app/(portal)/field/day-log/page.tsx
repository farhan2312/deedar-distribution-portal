import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import {
  durationLabel,
  formatISTDate,
  formatISTDateLong,
  formatISTTime,
  istDateString,
  istGreeting,
} from "@/lib/date";
import { Notice } from "@/components/ui/notice";
import { dayState, DayLogTables, type HistoryRow as AllHistoryRow, type TodayRow } from "../../supervisor/_components/day-log-tables";
import { DayLogClient, type HistoryRow } from "./day-log-client";

export default async function FieldDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="Day Log">You don&apos;t have Field Salesman access.</Notice>;
  }

  // Admin is unrestricted — this personal clock-in screen doesn't apply to
  // them, so they get a read-only, company-wide day-log table instead.
  if (user.accessRoles.includes("admin")) {
    return <AdminDayLogAll />;
  }

  const today = istDateString();
  const logs = await db
    .select()
    .from(dayLogs)
    .where(eq(dayLogs.userId, user.id))
    .orderBy(desc(dayLogs.logDate));

  const todayLog = logs.find((l) => l.logDate === today) ?? null;
  const history: HistoryRow[] = logs
    .filter((l) => l.logDate !== today)
    .map((l) => ({
      dateLabel: formatISTDate(l.logDate),
      startLabel: formatISTTime(l.startAt),
      endLabel: formatISTTime(l.endAt),
      onJobLabel: durationLabel(l.startAt, l.endAt),
    }));

  return (
    <DayLogClient
      greeting={istGreeting()}
      firstName={user.name.split(/\s+/)[0]}
      todayLabel={formatISTDateLong()}
      started={!!todayLog?.startAt}
      ended={!!todayLog?.endAt}
      startLabel={todayLog?.startAt ? formatISTTime(todayLog.startAt) : "Not started yet"}
      endLabel={todayLog?.endAt ? formatISTTime(todayLog.endAt) : "Not ended yet"}
      onJobLabel={durationLabel(todayLog?.startAt ?? null, todayLog?.endAt ?? null)}
      history={history}
    />
  );
}

async function AdminDayLogAll() {
  const today = istDateString();
  const [reps, logRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    db.select().from(dayLogs).orderBy(desc(dayLogs.logDate)).limit(300),
  ]);
  const repName = new Map(reps.map((r) => [r.id, r.name]));

  const todayRows: TodayRow[] = logRows
    .filter((l) => l.logDate === today)
    .map((l) => ({
      key: l.id,
      repName: repName.get(l.userId) ?? "—",
      startLabel: formatISTTime(l.startAt),
      endLabel: formatISTTime(l.endAt),
      onJobLabel: durationLabel(l.startAt, l.endAt),
      state: dayState(l.startAt, l.endAt),
      forced: l.endForced,
    }));
  const history: AllHistoryRow[] = logRows
    .filter((l) => l.logDate !== today)
    .map((l) => ({
      key: l.id,
      repName: repName.get(l.userId) ?? "—",
      dateLabel: formatISTDate(l.logDate),
      startLabel: formatISTTime(l.startAt),
      endLabel: formatISTTime(l.endAt),
      onJobLabel: durationLabel(l.startAt, l.endAt),
      state: dayState(l.startAt, l.endAt),
      forced: l.endForced,
    }));

  return (
    <div>
      <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        Day Log — company-wide
      </h4>
      <p className="mt-0.5 mb-5 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Every rep&apos;s clock-in/out, across every depot. Admin has no personal
        day log — this is a read-only company view.
      </p>
      <DayLogTables today={todayRows} history={history} />
    </div>
  );
}
