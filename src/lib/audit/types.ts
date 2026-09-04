import type { AuditAction, AuditChange, AuditModule } from "@/db/schema";

/**
 * Shapes the audit screen renders.
 *
 * Their own module because `lib/audit/data.ts` is `server-only`: the client
 * component needs these types, and importing them from the module that pulls
 * in the DB driver would drag `postgres` into the browser bundle. Types are
 * erased at compile time, but the import path is not.
 */

export type AuditRow = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorPhone: string | null;
  action: AuditAction;
  module: AuditModule;
  entityLabel: string | null;
  entityId: string | null;
  summary: string | null;
  changes: AuditChange[] | null;
  ip: string | null;
  userAgent: string | null;
};

/** What the server actually applied, so the controls show their real state. */
export type AuditFilters = {
  module: AuditModule | null;
  action: AuditAction | null;
  actorId: string | null;
  q: string;
};

export type { AuditChange };
