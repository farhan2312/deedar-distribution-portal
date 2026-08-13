import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dayLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { primaryRoleLabel } from "@/lib/auth/roles";
import { istDateString } from "@/lib/date";
import { getBugInbox } from "@/lib/bugs/notifications";
import { PortalShell } from "./_components/portal-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Live-location sharing follows the rep's open day, and the indicator lives
  // in the top bar so it persists across every screen. Resolved here (in the
  // layout) rather than per-page; `router.refresh()` after start/end day
  // re-runs this, so the pill appears and disappears with the clock.
  let trackingActive = false;
  if (canAccess(user, "field")) {
    const [log] = await db
      .select({ startAt: dayLogs.startAt, endAt: dayLogs.endAt })
      .from(dayLogs)
      .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.logDate, istDateString())))
      .limit(1);
    trackingActive = !!log?.startAt && !log.endAt;
  }

  // Rendered server-side so the bell's badge is correct on first paint.
  const bugInbox = await getBugInbox(user);

  return (
    <PortalShell
      userName={user.name}
      phone={user.phone}
      roleLabel={primaryRoleLabel(user.accessRoles)}
      accessRoles={user.accessRoles}
      trackingActive={trackingActive}
      bugInbox={bugInbox}
    >
      {children}
    </PortalShell>
  );
}
