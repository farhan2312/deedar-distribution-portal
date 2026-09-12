"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentUser } from "./dal";
import { deleteSession } from "./session";

export async function logoutAction() {
  // Recorded BEFORE the cookie is cleared: `recordAudit` resolves the actor
  // from the session, and after `deleteSession` there is nobody to attribute
  // the event to.
  //
  // And only when there IS a session. The button sits in a plain form, so a
  // second tap — or a stale tab whose session ended elsewhere — posts again
  // with the cookie already gone. Those repeats were writing a logout row with
  // no actor: 33 of 72 rows in the log, every one of them noise. A logout
  // without a session logged nobody out, so there is nothing to record.
  if (await getCurrentUser()) {
    await recordAudit({ action: "logout", module: "auth", summary: "Signed out" });
  }
  await deleteSession();
  redirect("/login");
}
