import pkg from "pg";
const { Pool } = pkg;

export function makePool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}
