import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
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
import { DayLogClient, type HistoryRow } from "./day-log-client";

export default async function FieldDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "field")) {
    return <Notice title="Day Log">You don&apos;t have Field Salesman ISR access.</Notice>;
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
