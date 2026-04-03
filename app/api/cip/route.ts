import { NextResponse } from "next/server";
import { fetchCIPRecords } from "@/lib/cip";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listName = searchParams.get("list") ?? "CIP";

  try {
    const records = await fetchCIPRecords(listName);
    return NextResponse.json({ success: true, count: records.length, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
