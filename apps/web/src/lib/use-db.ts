import { isDemoMode } from "./demo";

export function canUseDb(): boolean {
  if (isDemoMode()) return false;
  return Boolean(process.env.DATABASE_URL);
}
