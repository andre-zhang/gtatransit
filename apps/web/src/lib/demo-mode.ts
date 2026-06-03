import { isDatabaseConfigured } from "@gta/db";

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

/** Bundled demo JSON only when explicitly enabled or Postgres is not configured. */
export async function useDemoFixtures(): Promise<boolean> {
  const explicit = explicitDemo();
  if (explicit === true) return true;
  if (explicit === false) return false;
  return !isDatabaseConfigured();
}

export function demoModeEnvValue(): string {
  return isDemoMode() ? "1" : "";
}
