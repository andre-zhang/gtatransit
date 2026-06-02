export function parseList(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").filter(Boolean);
}

export function parseDirs(param: string | null): number[] {
  return parseList(param).map(Number).filter((n) => n === 0 || n === 1);
}
