"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { countersWorkbook, visitsWorkbook } from "./report-xlsx";
import {
  fetchCountersReport,
  fetchVisitsReport,
  resolveReportsScope,
  type ReportsParams,
} from "./reports";

/** A finished .xlsx, base64-encoded — a server action returns serialisable
 * values, and the browser turns this back into bytes for the download. */
export type ExportResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; error: string };

async function guard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  // Same gate as the report page: khq or admin. Kept here as well because a
  // server action is a public endpoint — never trust the caller's origin.
  if (!canAccess(user, "khq")) return { ok: false, error: "You don't have Kanpur HQ access." };
  return { ok: true };
}

function stamp(): string {
  // "20260817-153045" — filename-safe, sorts chronologically.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

export async function exportCountersXlsx(params: ReportsParams): Promise<ExportResult> {
  const g = await guard();
  if (!g.ok) return g;
  const scope = await resolveReportsScope(params);
  // No LIMIT for exports — the whole point of exporting is to get everything
  // that matched the filter, even when the on-screen view was trimmed.
  const rows = await fetchCountersReport(scope.filters, undefined, scope.sort);
  return {
    ok: true,
    filename: `counters-${stamp()}.xlsx`,
    base64: await countersWorkbook(rows, scope),
  };
}

export async function exportVisitsXlsx(params: ReportsParams): Promise<ExportResult> {
  const g = await guard();
  if (!g.ok) return g;
  // Same scope the page rendered — the ISR filter included — so the file
  // holds exactly what the screen was showing, every page of it.
  const scope = await resolveReportsScope({ ...params, tab: "visits" });
  const rows = await fetchVisitsReport(scope.filters);
  return {
    ok: true,
    filename: `visits-${stamp()}.xlsx`,
    base64: await visitsWorkbook(rows, scope),
  };
}
