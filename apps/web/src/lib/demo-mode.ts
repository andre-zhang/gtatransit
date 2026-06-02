/** Demo mode uses prebuilt fixtures in apps/web/demo (no PostGIS on Vercel). */
export function isDemoMode(): boolean {
  const explicit = process.env.DEMO_MODE?.toLowerCase();
  if (explicit === "0" || explicit === "false") return false;
  if (explicit === "1" || explicit === "true") return true;
  // Vercel deploys without local Docker/PostGIS — use bundled demo data by default.
  if (process.env.VERCEL && !process.env.DATABASE_URL) return true;
  return false;
}

export function demoModeEnvValue(): string {
  return isDemoMode() ? "1" : "";
}
