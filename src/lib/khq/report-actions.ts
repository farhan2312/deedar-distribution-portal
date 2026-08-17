"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import {
  countersToCsv,
  fetchCountersReport,
  fetchVisitsReport,
  resolveReportsScope,
  visitsToCsv,
  type ReportsParams,
} from "./reports";

export type CsvResult =
  | { ok: true; filename: string; data: string }
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

export async function exportCountersCsv(params: ReportsParams): Promise<CsvResult> {
  const g = await guard();
  if (!g.ok) return g;
  const scope = await resolveReportsScope(params);
  // No LIMIT for exports — the whole point of exporting is to get everything
  // that matched the filter, even when the on-screen view was trimmed.
  const rows = await fetchCountersReport(scope.filters);
  return { ok: true, filename: `counters-${stamp()}.csv`, data: countersToCsv(rows) };
}

export async function exportVisitsCsv(params: ReportsParams): Promise<CsvResult> {
  const g = await guard();
  if (!g.ok) return g;
  const scope = await resolveReportsScope(params);
  const rows = await fetchVisitsReport(scope.filters);
  return { ok: true, filename: `visits-${stamp()}.csv`, data: visitsToCsv(rows) };
}
