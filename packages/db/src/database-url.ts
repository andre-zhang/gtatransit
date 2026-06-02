export type DatabaseUrlPurpose = "app" | "migrate";

function trim(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

/** Build a postgres URL from discrete Neon / Vercel Postgres env vars. */
function urlFromParts(purpose: DatabaseUrlPurpose): string | null {
  const user = trim(process.env.NEON_USER ?? process.env.POSTGRES_USER);
  const password = trim(process.env.NEON_PASSWORD ?? process.env.POSTGRES_PASSWORD);
  const database = trim(
    process.env.NEON_DATABASE ?? process.env.POSTGRES_DATABASE ?? "neondb",
  );

  const host =
    purpose === "migrate"
      ? trim(process.env.NEON_HOST_UNPOOLED ?? process.env.POSTGRES_HOST_UNPOOLED)
      : trim(process.env.NEON_HOST ?? process.env.POSTGRES_HOST);

  if (!user || !password || !host) return null;

  const params = new URLSearchParams({ sslmode: "require" });
  if (purpose === "app") params.set("pgbouncer", "true");

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?${params}`;
}

/**
 * Resolve the Postgres connection string from Neon / Vercel Marketplace env vars.
 *
 * App runtime (pooled): DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL → NEON_DATABASE_URL → parts
 * Migrations (direct): DATABASE_URL_UNPOOLED → POSTGRES_URL_NON_POOLING → DATABASE_URL → parts
 */
export function resolveDatabaseUrl(purpose: DatabaseUrlPurpose): string | null {
  if (purpose === "app") {
    return (
      trim(process.env.DATABASE_URL) ??
      trim(process.env.POSTGRES_URL) ??
      trim(process.env.POSTGRES_PRISMA_URL) ??
      trim(process.env.NEON_DATABASE_URL) ??
      urlFromParts("app")
    );
  }

  return (
    trim(process.env.DATABASE_URL_UNPOOLED) ??
    trim(process.env.POSTGRES_URL_NON_POOLING) ??
    trim(process.env.DATABASE_URL) ??
    trim(process.env.NEON_DATABASE_URL_UNPOOLED) ??
    urlFromParts("migrate")
  );
}

export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl("app") != null || resolveDatabaseUrl("migrate") != null;
}

export function requireDatabaseUrl(purpose: DatabaseUrlPurpose): string {
  const url = resolveDatabaseUrl(purpose);
  if (!url) {
    throw new Error(
      purpose === "migrate"
        ? "No direct Postgres URL. Set DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING (Neon / Vercel Postgres)."
        : "No Postgres URL. Set DATABASE_URL or POSTGRES_URL (Neon / Vercel Postgres).",
    );
  }
  return url;
}
