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

const fileCache = new Map<string, { at: number; data: unknown }>();
const FILE_CACHE_TTL_MS = 60 * 60_000;

/** Read demo JSON from disk locally, or from this deployment's /demo/* static URLs on Vercel. */
export async function readDemoJsonFile<T>(filename: string): Promise<T> {
  const hit = fileCache.get(filename);
  if (hit && Date.now() - hit.at < FILE_CACHE_TTL_MS) {
    return hit.data as T;
  }

  const data = await readDemoJsonFileUncached<T>(filename);
  fileCache.set(filename, { at: Date.now(), data });
  return data;
}

async function readDemoJsonFileUncached<T>(filename: string): Promise<T> {
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
