import { NextResponse } from "next/server";
import { getGraphToken, graphFetch } from "@/lib/msgraph";

export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    // Step 1: Get token
    const token = await getGraphToken();
    steps.token = "OK";

    // Step 2: Get site
    const site = await graphFetch(
      `/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter`,
      token
    );
    steps.site = { id: site.id, name: site.displayName };

    // Step 3: List all lists on the site
    const lists = await graphFetch(`/sites/${site.id}/lists`, token);
    steps.lists = lists.value.map((l: { displayName: string; id: string }) => ({
      name: l.displayName,
      id: l.id,
    }));

    return NextResponse.json({ success: true, steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, steps, error: message }, { status: 500 });
  }
}
