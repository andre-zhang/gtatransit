import { getSql as getSqlClient } from "@gta/db";

let _sql: ReturnType<typeof getSqlClient> | null = null;

export function getSql() {
  if (!_sql) _sql = getSqlClient();
  return _sql;
}
