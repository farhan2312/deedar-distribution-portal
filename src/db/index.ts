// Build-time guarantee: importing the DB client (and therefore DATABASE_URL)
// into any client bundle fails the build, so the connection string can never
// leak to the browser. `auth/session.ts` and `auth/dal.ts` carry the same guard.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString, {
  /**
   * Room for one page's worth of parallel queries.
   *
   * The library's default is 10, and the HQ dashboards fire closer to twenty
   * reads at once: the last ten then queue behind the first ten and the page
   * pays two round trips to a database ~75 ms away instead of one. Connections
   * are pooled and long-lived, so this is a ceiling, not a cost — but it is a
   * ceiling per app instance, so it wants revisiting if this ever runs behind
   * more than a couple of them.
   */
  max: 24,
});

export const db = drizzle(client, { schema });
