import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDemoDir } from "./demo-dir";

function vercelOrigin(): string | null {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    process.env.VERCEL_BRANCH_URL?.trim();
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  return base.replace(/\/$/, "");
}

/** Read demo JSON from disk locally, or from this deployment's /demo/* static URLs on Vercel. */
export async function readDemoJsonFile<T>(filename: string): Promise<T> {
  const path = join(resolveDemoDir(), filename);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  const origin = vercelOrigin();
  if (origin) {
    const res = await fetch(`${origin}/demo/${filename}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) return res.json() as Promise<T>;
    throw new Error(`Demo file not found: ${origin}/demo/${filename} (${res.status})`);
  }

  throw new Error(`Demo file not found: ${path}`);
}
