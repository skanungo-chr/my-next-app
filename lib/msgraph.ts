const TENANT_ID = process.env.AZURE_TENANT_ID!;
// Graph API app ("my-next-app") — separate from the SSO app ("Dashboard CIP App")
const CLIENT_ID = process.env.AZURE_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_GRAPH_CLIENT_SECRET!;

// App-only token (client credentials) — used when no user token is available
export async function getGraphToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Graph token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Graph fetch — requires a delegated user token
export async function graphFetch(
  endpoint: string,
  token: string
): Promise<unknown> {
  if (!token) throw new Error("A delegated user token is required. Please sign in with Microsoft 365.");

  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API error: ${err}`);
  }

  return res.json();
}
