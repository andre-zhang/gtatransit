import { NextResponse } from "next/server";
import { getFilterTree } from "@/lib/filters-server";

export async function GET() {
  const { tree, rtUpdated } = await getFilterTree();
  return NextResponse.json({ tree, rtUpdated });
}
