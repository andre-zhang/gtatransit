import { existsSync } from "node:fs";
import { join } from "node:path";

/** Demo JSON lives under public/demo so Vercel serves it statically (not inside serverless bundles). */
export function resolveDemoDir(): string {
  const inPublic = join(process.cwd(), "public", "demo");
  if (existsSync(join(inPublic, "fixtures.json"))) return inPublic;
  const legacy = join(process.cwd(), "demo");
  if (existsSync(join(legacy, "fixtures.json"))) return legacy;
  return inPublic;
}
