import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

// Hard-coded from debug output — skips 3 round-trip discovery calls per sync page
const KNOWN_SITE_ID  = "chrsolutionsinc649.sharepoint.com,a9d92a60-44d5-47b7-86de-794f93999cd8,59463312-c77a-4349-8959-a2d659ec9ba3";
const KNOWN_LIST_ID  = "0d4249ce-7b8e-4a8d-bc67-07bc405ac2ce";

// Common name variations to try when the configured list name isn't found
const LIST_NAME_CANDIDATES = [
  "CIP",
  "CIP Records",
  "CIPRecords",
  "Change Implementation Plan",
  "Change Implementation Plans",
  "CIP List",
  "CIPs",
];

export interface CIPRecord {
  id: string;
  chrTicketNumbers: string;
  cipType: string;
  cipStatus: string;
  submissionDate: string;
  emergencyFlag: boolean;
  clientName: string;
  product: string;
  category: string;
  environmentsImpacted: string[];
  softwareVersion?: string;
  productVersion?: string;
}

export const ENVIRONMENT_OPTIONS = [
  "Development",
  "Production",
  "QA",
  "Research",
  "Staging",
  "Test",
] as const;

async function getSiteId(token?: string | null): Promise<string> {
  const data = await graphFetch(
    `/sites/${SHAREPOINT_HOST}:${SITE_PATH}:`,
    token
  ) as { id: string };
  return data.id;
}

async function getAllLists(siteId: string, token?: string | null): Promise<{ displayName: string; id: string }[]> {
  const data = await graphFetch(`/sites/${siteId}/lists`, token) as {
    value: { displayName: string; id: string }[];
  };
  return data.value;
}

async function getListId(siteId: string, listName: string, token?: string | null): Promise<string> {
  const lists = await getAllLists(siteId, token);

  // Try exact match first (case-insensitive)
  let list = lists.find((l) => l.displayName.toLowerCase() === listName.toLowerCase());

  // If not found, try all known candidates
  if (!list) {
    for (const candidate of LIST_NAME_CANDIDATES) {
      list = lists.find((l) => l.displayName.toLowerCase() === candidate.toLowerCase());
      if (list) break;
    }
  }

  // If still not found, include available list names in the error
  if (!list) {
    const available = lists
      .filter((l) => !l.displayName.startsWith("_") && !l.displayName.startsWith("appdata"))
      .map((l) => `"${l.displayName}"`)
      .join(", ");
    throw new Error(
      `CIP list not found on SharePoint site. Available lists: ${available || "none"}. ` +
      `Set SHAREPOINT_LIST_NAME env var to the correct list name.`
    );
  }

  return list.id;
}

// Core fields we always need — used with $select for efficiency.
// Environment field is intentionally EXCLUDED from this list because
// the actual SharePoint internal name is unknown; we fetch ALL fields
// and discover it at runtime in extractEnvironments().
const FIELDS_SELECT = [
  "CHR_x0020_Ticket_x0020_Number_x0",
  "formStatus",
  "CIPStatuss",
  "Submission_x0020_Date",
  "Emergency_x0020_Change_x0020__x0",
  "Change_x0020_Name",
  // Product field variants (all silently ignored if wrong)
  "Product_x0020_and_x0020_Version",
  "Product_x0020__x0026__x0020_Version",
  "Product_x0020_Version",
  "Product",
  "ProductandVersion",
  "Category",
].join(",");

// Known environment values for value-based field detection.
const ENV_VALUES = new Set(
  ["development", "production", "qa", "research", "staging", "test"]
);

/** SharePoint can return choice fields as strings OR lookup fields as objects */
function extractText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    const v = o.LookupValue ?? o.Value ?? o.DisplayValue ?? o.lookupValue ?? "";
    return String(v).trim();
  }
  return String(val).trim();
}

/**
 * Parse a SharePoint multi-select / multi-checkbox field into a string array.
 * Handles: native arrays, ";#"-delimited strings, ";"-delimited, and ","-delimited.
 */
function extractMultiValue(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return (val as unknown[]).map(String).map(s => s.trim()).filter(Boolean);
  const str = typeof val === "string" ? val : String(val);
  if (!str.trim()) return [];
  // SharePoint legacy multi-value delimiter
  if (str.includes(";#")) return str.split(";#").map(s => s.trim()).filter(Boolean);
  if (str.includes(";"))  return str.split(";").map(s => s.trim()).filter(Boolean);
  if (str.includes(","))  return str.split(",").map(s => s.trim()).filter(Boolean);
  return [str.trim()];
}

type SPItem = {
  id: string;
  fields: Record<string, unknown>;
};

/**
 * Multi-strategy environment field extraction.
 *
 * Strategy 1 — explicit name variants: tries every known encoding of
 *   "Environment(s) Impacted" / "Environments Impacted" etc.
 * Strategy 2 — boolean columns: SharePoint sometimes models each
 *   environment as a separate Yes/No column (Development, Production …).
 * Strategy 3 — value scan: scans ALL returned fields and treats any
 *   whose parsed values are all known environment strings as the field.
 *
 * Because the URL no longer uses $select for environment, all SharePoint
 * fields are returned, so Strategy 3 will always find the right one even
 * if the internal name was completely unknown.
 */
function extractEnvironments(fields: Record<string, unknown>): string[] {
  // Strategy 1 — known multi-value field name variants
  const MULTI_VARIANTS = [
    "Environment_x0028_s_x0029__x0020_Impacted", // "Environment(s) Impacted"
    "Environments_x0020_Impacted",               // "Environments Impacted"
    "Environment_x0020_Impacted",                // "Environment Impacted"
    "EnvironmentsImpacted",
    "Environments",
    "Environment",
    "EnvironmentImpacted",
    "EnvironmentsAffected",
    "Environment_x0020_Impact",
    "Impacted_x0020_Environments",
  ];
  for (const name of MULTI_VARIANTS) {
    const raw = fields[name];
    if (raw !== undefined && raw !== null && raw !== "") {
      const vals = extractMultiValue(raw);
      if (vals.length > 0) return vals;
    }
  }

  // Strategy 2 — separate Yes/No boolean columns per environment
  const boolHits: string[] = [];
  for (const env of ["Development", "Production", "QA", "Research", "Staging", "Test"]) {
    const v = fields[env] ?? fields[env.toUpperCase()];
    if (v === true || v === "Yes" || v === "1" || v === 1) boolHits.push(env);
  }
  if (boolHits.length > 0) return boolHits;

  // Strategy 3 — value-based scan: any field whose values are exclusively
  // known environment names is assumed to be the environment field.
  for (const [key, val] of Object.entries(fields)) {
    // Skip system / metadata columns
    if (!val || key === "Title" || key === "ID" || key === "id" ||
        key.startsWith("@") || key.startsWith("_")) continue;
    const parsed = extractMultiValue(val);
    if (
      parsed.length > 0 &&
      parsed.every(v => ENV_VALUES.has(v.toLowerCase()))
    ) {
      return parsed;
    }
  }

  return [];
}

function mapItem(item: SPItem): CIPRecord {
  const f = item.fields;

  const product = extractText(
    f["Product_x0020_and_x0020_Version"] ??
    f["Product_x0020__x0026__x0020_Version"] ??
    f["Product_x0020_Version"] ??
    f["Product"] ??
    f["ProductandVersion"] ??
    undefined
  );

  const softwareVersion = extractText(
    f["Software_x0020_Version_x0028_s_x0029_"] ??
    f["SoftwareVersions"] ??
    f["Software_x0020_Versions"] ??
    f["Software_x0020_Version"] ??
    f["SoftwareVersion"] ??
    undefined
  );

  const productVersion = extractText(
    f["Product_x0020__x002d__x0020_Version"] ??
    f["ProductVersion"] ??
    undefined
  );

  return {
    id:                  item.id,
    chrTicketNumbers:    extractText(f["CHR_x0020_Ticket_x0020_Number_x0"]),
    cipType:             extractText(f["formStatus"]),
    cipStatus:           extractText(f["CIPStatuss"]),
    submissionDate:      extractText(f["Submission_x0020_Date"]),
    emergencyFlag:       extractText(f["Emergency_x0020_Change_x0020__x0"]) === "Yes",
    clientName:          extractText(f["Change_x0020_Name"]),
    product,
    category:            extractText(f["Category"]),
    environmentsImpacted: extractEnvironments(f),
    softwareVersion,
    productVersion,
  };
}

export const FETCH_FROM_YEARS: Record<string, string> = {
  "2026": "2026-01-01T00:00:00Z",
  "2025": "2025-01-01T00:00:00Z",
  "2024": "2024-01-01T00:00:00Z",
  "2023": "2023-01-01T00:00:00Z",
  "All":  "2020-01-01T00:00:00Z",
};

/** Fetch one page of records. Returns records + nextLink for pagination. */
export async function fetchCIPRecordsPage(
  listName?: string | null,
  userToken?: string | null,
  nextLink?: string | null,
  fromYear?: string | null,
): Promise<{ records: CIPRecord[]; nextLink: string | null }> {
  const resolvedList = listName ?? process.env.SHAREPOINT_LIST_NAME ?? "CIP";
  const token = userToken ?? undefined;

  let url: string;
  if (nextLink) {
    url = nextLink;
  } else {
    // Use hard-coded IDs to skip 3 discovery round-trips (getSiteId + getAllLists + getListId)
    // which was burning the Vercel 10s timeout before the first record was fetched.
    // Update KNOWN_SITE_ID / KNOWN_LIST_ID if the SharePoint site is ever migrated.
    let siteId = KNOWN_SITE_ID;
    let listId = KNOWN_LIST_ID;
    if (!siteId || !listId) {
      siteId = await getSiteId(token);
      listId = await getListId(siteId, resolvedList, token);
    }
    const fromDate = FETCH_FROM_YEARS[fromYear ?? "2025"] ?? FETCH_FROM_YEARS["2025"];
    const dateFilter = `fields/Submission_x0020_Date ge '${fromDate}'`;
    const folderFilter = `fields/ContentType ne 'Folder'`;
    // NOTE: We intentionally do NOT use $select on fields here.
    // Using $select requires knowing the exact internal field name for every column.
    // For fields whose internal name is unknown (e.g. Environment(s) Impacted),
    // $select silently returns nothing. Fetching all fields lets mapItem/extractEnvironments
    // discover the correct field by value-matching regardless of its internal name.
    // The extra data per record (~50 fields vs ~12) is acceptable for a sync workload.
    url = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$filter=${folderFilter} and ${dateFilter}&$orderby=fields/Submission_x0020_Date desc&$top=25`;
  }

  const page = await graphFetch(url, token) as { value: SPItem[]; "@odata.nextLink"?: string };
  return {
    records: page.value.map(mapItem),
    nextLink: page["@odata.nextLink"] ?? null,
  };
}

/** Fetch ALL records (used for non-serverless contexts). */
export async function fetchCIPRecords(
  listName?: string | null,
  userToken?: string | null
): Promise<CIPRecord[]> {
  const all: CIPRecord[] = [];
  let nextLink: string | null = null;
  do {
    const page = await fetchCIPRecordsPage(listName, userToken, nextLink);
    all.push(...page.records);
    nextLink = page.nextLink;
  } while (nextLink);
  return all;
}
