import { NextResponse } from "next/server";
import { getGraphToken, graphFetch } from "@/lib/msgraph";

export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    const token = await getGraphToken();
    steps.token = "OK";

    // Try alternate site lookup using hostname + path
    let site;
    try {
      site = await graphFetch(
        `/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter:`,
        token
      );
      steps.site = { id: site.id, name: site.displayName };
    } catch (e1) {
      steps.site_attempt1 = e1 instanceof Error ? e1.message : String(e1);

      // Fallback: search for site by name
      try {
        const search = await graphFetch(`/sites?search=CIPCenter`, token);
        steps.site_search = search.value?.map((s: { id: string; displayName: string; webUrl: string }) => ({
          id: s.id,
          name: s.displayName,
          url: s.webUrl,
        }));
        site = search.value?.[0];
      } catch (e2) {
        steps.site_attempt2 = e2 instanceof Error ? e2.message : String(e2);
        throw new Error("Cannot access SharePoint site — ensure Sites.Read.All permission is granted with admin consent in Azure");
      }
    }

    if (!site?.id) throw new Error("Site not found");

    // List all lists
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
