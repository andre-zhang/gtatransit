import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const migration = readFileSync(join(__dirname, "migrations", "001_init.sql"), "utf8");

await sql.unsafe(migration);
console.log("Migration 001_init applied");
await sql.end();
