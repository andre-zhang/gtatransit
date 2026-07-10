import { isDatabaseConfigured } from "@gta/db";
import { getSql } from "@/lib/db";

function explicitDemo(): boolean | null {
  const v = process.env.DEMO_MODE?.toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

/** Sync check — use only when async DB probe is not possible. */
export function isDemoMode(): boolean {
  const explicit = explicitDemo();
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (!isDatabaseConfigured()) return true;
  return false;
}

let dbProbe: { at: number; demo: boolean } | null = null;
let dbProbeInflight: Promise<boolean> | null = null;
const DB_PROBE_TTL_MS = 5 * 60_000;

/** Demo fixtures when DEMO_MODE=1, no DB, or Neon is still empty (no GTFS import yet). */
export async function useDemoFixtures(): Promise<boolean> {
  const explicit = explicitDemo();
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (!isDatabaseConfigured()) return true;

  // The probe runs on nearly every request — cache it so each one isn't a Neon roundtrip.
  if (dbProbe && Date.now() - dbProbe.at < DB_PROBE_TTL_MS) return dbProbe.demo;
  if (dbProbeInflight) return dbProbeInflight;

  dbProbeInflight = (async () => {
    try {
      const db = getSql();
      const rows = await db`SELECT 1 FROM feeds LIMIT 1`;
      const demo = rows.length === 0;
      dbProbe = { at: Date.now(), demo };
      return demo;
    } catch {
      dbProbe = { at: Date.now(), demo: true };
      return true;
    } finally {
      dbProbeInflight = null;
    }
  })();

  return dbProbeInflight;
}

export function demoModeEnvValue(): string {
  return isDemoMode() ? "1" : "";
}
