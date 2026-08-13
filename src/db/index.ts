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

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
