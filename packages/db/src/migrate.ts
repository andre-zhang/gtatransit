import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";
import { requireDatabaseUrl } from "./database-url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = requireDatabaseUrl("migrate");
const sql = postgres(url, { max: 1, ssl: "require", prepare: false });

const migration = readFileSync(join(__dirname, "migrations", "001_init.sql"), "utf8");

await sql.unsafe(migration);
console.log("Migration 001_init applied (PostGIS + schema)");
await sql.end();
