import { createReadStream } from "node:fs";
import { parse } from "csv-parse";

export async function* readCsv(path: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(path).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true }),
  );
  for await (const row of parser) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row as Record<string, string>)) {
      normalized[key.replace(/^\uFEFF/, "")] = value;
    }
    yield normalized;
  }
}

export function pick(row: Record<string, string>, key: string): string {
  return (row[key] ?? "").trim();
}
