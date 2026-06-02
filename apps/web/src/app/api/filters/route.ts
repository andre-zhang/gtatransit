import { NextResponse } from "next/server";
import { getFilterTree } from "@/lib/filters-server";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET() {
  const { tree, rtUpdated } = await getFilterTree();
  return NextResponse.json({ tree, rtUpdated });
}
