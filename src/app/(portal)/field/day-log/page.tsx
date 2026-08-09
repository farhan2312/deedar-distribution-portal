import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { Notice } from "@/components/ui/notice";
import { DayLogClient } from "./day-log-client";

export default async function FieldDayLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.accessRoles.includes("field")) {
    return <Notice title="Day Log">You don&apos;t have Field Salesman access.</Notice>;
  }

  const firstName = user.name.split(/\s+/)[0];
  return <DayLogClient firstName={firstName} />;
}
