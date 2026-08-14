// Turning Postgres constraint violations into admin-facing messages.
//
// Shared by every admin/HQ write action so the mapping can't drift. Plain
// module (no "use server") — a "use server" file may only export async
// functions, so these helpers have to live outside one.

/** Duplicate value for a UNIQUE column/index. */
const UNIQUE_VIOLATION = "23505";
/**
 * The two ways a blocked delete surfaces, and the distinction that matters:
 * a plain FK (NO ACTION, the default) raises 23503, but a column declared
 * `ON DELETE RESTRICT` raises 23001 instead. This schema uses RESTRICT, so
 * handling only 23503 meant every blocked delete crashed the page.
 */
const FK_VIOLATION = "23503";
const RESTRICT_VIOLATION = "23001";

export type WriteResult = { ok: true } | { ok: false; error: string };

/**
 * SQLSTATE of a Postgres error, or null if this isn't one.
 *
 * Walks the `cause` chain rather than reading `.code` off the top level:
 * Drizzle wraps every driver error in a `DrizzleQueryError` whose own keys are
 * just `{ query, params, cause }` — the `PostgresError` carrying the SQLSTATE
 * sits underneath in `cause`. Reading only the outer object found no code, so
 * every constraint violation fell through and crashed the page.
 */
export function pgCode(e: unknown): string | null {
  let current: unknown = e;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Failure message for a blocked/failed DELETE. */
export function deleteFailure(e: unknown, what: string): WriteResult {
  const code = pgCode(e);
  if (code === RESTRICT_VIOLATION || code === FK_VIOLATION) {
    return { ok: false, error: `Can't delete this ${what} — remove everything under it first.` };
  }
  return unexpected(e, `delete ${what}`);
}

/** Failure message for a failed INSERT/UPDATE. */
export function insertFailure(e: unknown, what: string): WriteResult {
  if (pgCode(e) === UNIQUE_VIOLATION) {
    return { ok: false, error: `A ${what} with that name already exists.` };
  }
  return unexpected(e, `save ${what}`);
}

/**
 * Any other database error becomes a message rather than a crash — an admin
 * CRUD screen should never hand the user Next's error page. Non-database
 * errors (including Next's redirect/notFound signals) are re-thrown untouched.
 */
function unexpected(e: unknown, action: string): WriteResult {
  const code = pgCode(e);
  if (!code) throw e;
  console.error(`[db] failed to ${action} (SQLSTATE ${code})`);
  return { ok: false, error: `Couldn't ${action} — please try again.` };
}
