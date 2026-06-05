import { NextResponse } from "next/server";
import { graphFetch } from "@/lib/msgraph";

interface SharePointSite {
  id: string;
  displayName: string;
  webUrl: string;
}

interface SharePointList {
  id: string;
  displayName: string;
}

interface SharePointColumn {
  name: string;
  displayName: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const steps: Record<string, unknown> = {
    accessMode: token ? "delegated" : "app-only",
  };

  try {
    // Step 1: Get site
    const site = await graphFetch(
      `/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter:`,
      token
    ) as SharePointSite;
    steps.site = { id: site.id, name: site.displayName, url: site.webUrl };

    // Step 2: Get all lists
    const listsData = await graphFetch(`/sites/${site.id}/lists`, token) as { value: SharePointList[] };
    const userLists = listsData.value.filter(
      (l) => !l.displayName.startsWith("_") && !l.displayName.startsWith("appdata")
    );
    steps.availableLists = userLists.map((l) => l.displayName);

    // Step 3: Find the CIP list
    const listNameEnv = process.env.SHAREPOINT_LIST_NAME ?? "Change Implementation Plan";
    const cipList = userLists.find(
      (l) => l.displayName.toLowerCase() === listNameEnv.toLowerCase()
    ) ?? userLists.find(
      (l) => ["cip", "cip records", "ciprecords", "change implementation plan", "change implementation plans", "cip list", "cips"]
        .includes(l.displayName.toLowerCase())
    );

    if (!cipList) {
      steps.error = `CIP list not found. Looked for "${listNameEnv}". Available: ${userLists.map((l) => l.displayName).join(", ")}`;
      return NextResponse.json({ success: false, steps });
    }

    steps.cipList = { name: cipList.displayName, id: cipList.id };

    // Step 4: Get columns (internal field names)
    const columnsData = await graphFetch(
      `/sites/${site.id}/lists/${cipList.id}/columns`,
      token
    ) as { value: SharePointColumn[] };
    steps.columns = columnsData.value
      .filter((c) => !c.name.startsWith("_") && !["Edit", "LinkTitle", "LinkTitleNoMenu", "DocIcon", "ItemChildCount", "FolderChildCount", "AppAuthor", "AppEditor"].includes(c.name))
      .map((c) => ({ internalName: c.name, displayName: c.displayName }));

    // Step 5: Fetch 5 recent non-folder items with ALL fields (no $select) to find Product
    const itemsData = await graphFetch(
      `/sites/${site.id}/lists/${cipList.id}/items?$expand=fields&$filter=fields/ContentType ne 'Folder'&$orderby=fields/Submission_x0020_Date desc&$top=5`,
      token
    ) as { value: { id: string; fields: Record<string, unknown> }[] };

    const ENV_KNOWN = new Set(["development","production","qa","research","staging","test"]);
    const KNOWN_PRODUCTS = ["OMNIA","Omnia360","OASIS FM","Advanced Customer Portal","Payment Processor","Report Writer","XML Invoice"];

    if (itemsData.value.length > 0) {
      steps.sampleItemFields = itemsData.value[0].fields;

      // Product field discovery
      steps.productFieldSearch = itemsData.value.map((item) => {
        const hit: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(item.fields)) {
          const s = String(val ?? "");
          if (key.toLowerCase().includes("product") ||
              KNOWN_PRODUCTS.some(p => s.toLowerCase().includes(p.toLowerCase()))) {
            hit[key] = val;
          }
        }
        return { id: item.id, productFields: hit };
      });

      // Environment field discovery — three strategies
      const envColumnNames = (columnsData.value as SharePointColumn[])
        .filter(c => c.displayName.toLowerCase().includes("environment") ||
                     c.name.toLowerCase().includes("environment"))
        .map(c => ({ internalName: c.name, displayName: c.displayName }));

      steps.environmentColumnNames = envColumnNames.length > 0
        ? envColumnNames
        : "No columns with 'environment' in the name were found.";

      steps.environmentFieldSearch = itemsData.value.map((item) => {
        const hit: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(item.fields)) {
          const s = String(val ?? "").toLowerCase();
          // Match by key name containing "environment" / "impacted"
          if (key.toLowerCase().includes("environment") || key.toLowerCase().includes("impacted")) {
            hit[key] = val;
          }
          // Match by value containing known environment strings
          if (!hit[key] && val && s.split(/[;,|]/).map(x => x.trim()).every(x => ENV_KNOWN.has(x))) {
            hit[key] = val;
          }
        }
        // Also check separate boolean columns
        for (const env of ["Development","Production","QA","Research","Staging","Test"]) {
          if (item.fields[env] !== undefined) hit[env] = item.fields[env];
        }
        return { id: item.id, environmentFields: hit };
      });
    } else {
      steps.sampleItemFields = "No items in list";
    }

    // Step 6: Show current field mapping
    steps.currentMapping = {
      "CHR_x0020_Ticket_x0020_Number_x0 → chrTicketNumbers": "CHR Ticket Number",
      "formStatus → cipType": "CIP Type",
      "CIPStatuss → cipStatus": "CIP Status",
      "Submission_x0020_Date → submissionDate": "Submission Date",
      "Change_x0020_Name → clientName": "Client Name",
      "Product (variant) → product": "Product",
      "Environment (auto-detected) → environmentsImpacted": "Environment(s) Impacted",
    };

    return NextResponse.json({ success: true, steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, steps, error: message }, { status: 500 });
  }
}
