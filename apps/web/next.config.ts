import type { NextConfig } from "next";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });
config({ path: resolve(process.cwd(), ".env.local") });

function isDatabaseConfigured(): boolean {
  const keys = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PRISMA_URL",
    "NEON_DATABASE_URL",
    "POSTGRES_HOST",
    "NEON_HOST",
  ];
  return keys.some((k) => Boolean(process.env[k]?.trim()));
}

function demoModeValue(): string {
  const explicit = process.env.DEMO_MODE?.toLowerCase();
  if (explicit === "0" || explicit === "false") return "";
  if (explicit === "1" || explicit === "true") return "1";
  // Default to demo on Vercel unless DEMO_MODE=0 (Neon without GTFS import is common).
  if (process.env.VERCEL) return "1";
  if (isDatabaseConfigured()) return "";
  return process.env.DEMO_MODE ?? "";
}

const demoMode = demoModeValue();

const nextConfig: NextConfig = {
  transpilePackages: ["@gta/db"],
  env: {
    DEMO_MODE: demoMode,
    NEXT_PUBLIC_DEMO_MODE: demoMode,
  },
};

export default nextConfig;
