import { sql } from "drizzle-orm";

// Seed and roster mutations take this lock before reading or changing the roster.
export const rosterWriteLock = sql`select pg_advisory_xact_lock(732941)`;