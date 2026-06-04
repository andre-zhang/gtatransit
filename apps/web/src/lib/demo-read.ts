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
  const origin = vercelOrigin();

  // On Vercel, never touch public/demo via fs (Next traces the whole folder into lambdas).
  if (process.env.VERCEL) {
    if (!origin) {
      throw new Error(`Demo file ${filename}: VERCEL_URL not set`);
    }
    const res = await fetch(`${origin}/demo/${filename}`, {
      cache: "no-store",
    });
    if (res.ok) return res.json() as Promise<T>;
    throw new Error(`Demo file not found: ${origin}/demo/${filename} (${res.status})`);
  }

  const path = join(resolveDemoDir(), filename);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  if (origin) {
    const res = await fetch(`${origin}/demo/${filename}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) return res.json() as Promise<T>;
  }

  throw new Error(`Demo file not found: ${path}`);
}
