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

/**
 * Use bundled demo fixtures when Neon is empty or unreachable.
 * Neon env vars disable sync demo mode, but an empty DB shows nothing without this.
 */
export async function useDemoFixtures(): Promise<boolean> {
  const explicit = explicitDemo();
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (!isDatabaseConfigured()) return true;

  try {
    const db = getSql();
    const rows = await db`SELECT 1 FROM feeds LIMIT 1`;
    return rows.length === 0;
  } catch {
    return true;
  }
}

export function demoModeEnvValue(): string {
  return isDemoMode() ? "1" : "";
}
