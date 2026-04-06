import { NextResponse } from "next/server";
import { fetchCIPRecords } from "@/lib/cip";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listName = searchParams.get("list") ?? "CIP";

  // Extract delegated user token from Authorization header if present
  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!userToken) {
    return NextResponse.json(
      { success: false, error: "Sign in with Microsoft 365 to access CIP records." },
      { status: 401 }
    );
  }

  try {
    const records = await fetchCIPRecords(listName, userToken);
    return NextResponse.json({ success: true, accessMode: "delegated", count: records.length, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
