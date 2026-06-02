import type { NextConfig } from "next";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });
config({ path: resolve(process.cwd(), ".env.local") });

function demoModeValue(): string {
  const explicit = process.env.DEMO_MODE?.toLowerCase();
  if (explicit === "0" || explicit === "false") return "";
  if (explicit === "1" || explicit === "true") return "1";
  if (process.env.VERCEL && !process.env.DATABASE_URL) return "1";
  return process.env.DEMO_MODE ?? "";
}

const demoMode = demoModeValue();

const nextConfig: NextConfig = {
  transpilePackages: ["@gta/db"],
  env: {
    DEMO_MODE: demoMode,
    NEXT_PUBLIC_DEMO_MODE: demoMode,
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./demo/**/*"],
  },
};

export default nextConfig;
