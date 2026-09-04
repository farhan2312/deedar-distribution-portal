"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit/record";
import { deleteSession } from "./session";

export async function logoutAction() {
  // Recorded BEFORE the cookie is cleared: `recordAudit` resolves the actor
  // from the session, and after `deleteSession` there is nobody to attribute
  // the event to.
  await recordAudit({ action: "logout", module: "auth", summary: "Signed out" });
  await deleteSession();
  redirect("/login");
}
