/**
 * Database helper.
 * Exports a tiny factory so the server can create a PostgreSQL pool from environment config.
 */

import pkg from "pg";
const { Pool } = pkg;

export function makePool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}
