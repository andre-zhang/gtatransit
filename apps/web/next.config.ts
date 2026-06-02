import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env.local") });

const nextConfig: NextConfig = {
  transpilePackages: ["@gta/db"],
  env: {
    DEMO_MODE: process.env.DEMO_MODE ?? "",
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? "",
  },
};

export default nextConfig;
