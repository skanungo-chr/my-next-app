import { NextResponse } from "next/server";
import { graphFetch } from "@/lib/msgraph";

const KNOWN_SITE_ID = "chrsolutionsinc649.sharepoint.com,a9d92a60-44d5-47b7-86de-794f93999cd8,59463312-c77a-4349-8959-a2d659ec9ba3";
const KNOWN_LIST_ID = "0d4249ce-7b8e-4a8d-bc67-07bc405ac2ce";

// GET /api/debug-fields
// Returns all raw field keys + values from the 3 most recent SharePoint CIP records.
// Use this to find the exact internal name for unmapped fields (e.g. "Software Version(s)").
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const url = `/sites/${KNOWN_SITE_ID}/lists/${KNOWN_LIST_ID}/items?$expand=fields&$filter=fields/ContentType ne 'Folder'&$orderby=fields/Submission_x0020_Date desc&$top=3`;
    const data = await graphFetch(url, token) as { value: { id: string; fields: Record<string, unknown> }[] };

    const samples = data.value.map((item) => ({
      id: item.id,
      // Filter to fields likely related to software/version/product to keep the response readable
      softwareAndVersionFields: Object.fromEntries(
        Object.entries(item.fields).filter(([k]) =>
          /software|version|product/i.test(k)
        )
      ),
      // Also include ALL field keys (without values) so nothing is missed
      allFieldKeys: Object.keys(item.fields).sort(),
    }));

    return NextResponse.json({ samples });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
