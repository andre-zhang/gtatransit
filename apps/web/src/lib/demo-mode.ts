import { isDatabaseConfigured } from "@gta/db";

/** Demo mode uses prebuilt fixtures when no Postgres is configured. */
export function isDemoMode(): boolean {
  const explicit = process.env.DEMO_MODE?.toLowerCase();
  if (explicit === "0" || explicit === "false") return false;
  if (explicit === "1" || explicit === "true") return true;
  if (isDatabaseConfigured()) return false;
  // Vercel without Neon — fall back to bundled demo fixtures.
  if (process.env.VERCEL) return true;
  return false;
}

export function demoModeEnvValue(): string {
  return isDemoMode() ? "1" : "";
}
