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
    `/sites/${SHAREPOINT_HOST}:${SITE_PATH}`,
    token
  );
  return data.id;
}

async function getListId(siteId: string, listName: string, token: string): Promise<string> {
  const data = await graphFetch(`/sites/${siteId}/lists`, token);
  const list = data.value.find(
    (l: { displayName: string; id: string }) =>
      l.displayName.toLowerCase() === listName.toLowerCase()
  );
  if (!list) throw new Error(`List "${listName}" not found on SharePoint site`);
  return list.id;
}

export async function fetchCIPRecords(listName = "CIP"): Promise<CIPRecord[]> {
  const token = await getGraphToken();
  const siteId = await getSiteId(token);
  const listId = await getListId(siteId, listName, token);

  const data = await graphFetch(
    `/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,CIPType,CIPStatus,SubmissionDate)&$top=100`,
    token
  );

  return data.value.map((item: {
    id: string;
    fields: {
      Title?: string;
      CIPType?: string;
      CIPStatus?: string;
      SubmissionDate?: string;
    };
  }) => ({
    id: item.id,
    chrTicketNumbers: item.fields.Title ?? "",
    cipType: item.fields.CIPType ?? "",
    cipStatus: item.fields.CIPStatus ?? "",
    submissionDate: item.fields.SubmissionDate ?? "",
  }));
}
