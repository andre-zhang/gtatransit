import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!client) {
    client = postgres(url, { max: 10 });
  }
  return drizzle(client, { schema });
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!client) {
    client = postgres(url, { max: 10 });
  }
  return client;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
  }
}
