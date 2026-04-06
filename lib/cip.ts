import { getGraphToken, graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

export interface CIPRecord {
  id: string;
  chrTicketNumbers: string;
  cipType: string;
  cipStatus: string;
  submissionDate: string;
}

async function getSiteId(token: string): Promise<string> {
  const data = await graphFetch(
    `/sites/${SHAREPOINT_HOST}:${SITE_PATH}:`,
    token
  ) as { id: string };
  return data.id;
}

async function getListId(siteId: string, listName: string, token: string): Promise<string> {
  const data = await graphFetch(`/sites/${siteId}/lists`, token) as {
    value: { displayName: string; id: string }[];
  };
  const list = data.value.find(
    (l) => l.displayName.toLowerCase() === listName.toLowerCase()
  );
  if (!list) throw new Error(`List "${listName}" not found on SharePoint site`);
  return list.id;
}

export async function fetchCIPRecords(
  listName = "CIP",
  userToken?: string | null
): Promise<CIPRecord[]> {
  // Use delegated user token if available, otherwise fall back to app-only token
  const token = userToken ?? (await getGraphToken());

  const siteId = await getSiteId(token);
  const listId = await getListId(siteId, listName, token);

  const data = await graphFetch(
    `/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,CIPType,CIPStatus,SubmissionDate)&$top=100`,
    token
  ) as {
    value: {
      id: string;
      fields: {
        Title?: string;
        CIPType?: string;
        CIPStatus?: string;
        SubmissionDate?: string;
      };
    }[];
  };

  return data.value.map((item) => ({
    id: item.id,
    chrTicketNumbers: item.fields.Title ?? "",
    cipType: item.fields.CIPType ?? "",
    cipStatus: item.fields.CIPStatus ?? "",
    submissionDate: item.fields.SubmissionDate ?? "",
  }));
}
