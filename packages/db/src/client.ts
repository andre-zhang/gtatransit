import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "./database-url";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;

function createClient() {
  const url = requireDatabaseUrl("app");
  const onVercel = Boolean(process.env.VERCEL);
  return postgres(url, {
    // Neon pooler (PgBouncer) requires prepare: false in transaction mode.
    prepare: false,
    ssl: "require",
    max: onVercel ? 1 : 10,
    idle_timeout: onVercel ? 5 : 20,
    connect_timeout: 15,
  });
}

export function getDb() {
  if (!client) client = createClient();
  return drizzle(client, { schema });
}

export function getSql() {
  if (!client) client = createClient();
  return client;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
  }
}
