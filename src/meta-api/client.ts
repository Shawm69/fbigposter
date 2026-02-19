import * as https from "https";
import * as url from "url";
import { readJSON, writeJSON } from "../storage/files";
import { metaTokensPath } from "../storage/paths";

const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

export interface MetaTokens {
  page_access_token: string;
  user_access_token: string;
  token_expires_at: string;
  last_refreshed: string;
  page_id?: string;
  ig_user_id?: string;
}

export interface GraphAPIResponse {
  data?: any;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
  id?: string;
  [key: string]: any;
}

/**
 * Load stored Meta API tokens.
 */
export function loadTokens(): MetaTokens | null {
  return readJSON<MetaTokens>(metaTokensPath());
}

/**
 * Save Meta API tokens.
 */
export function saveTokens(tokens: MetaTokens): void {
  writeJSON(metaTokensPath(), tokens);
}

export interface StoreTokenResult {
  tokens: MetaTokens;
  page_name: string | null;
  ig_linked: boolean;
}

/**
 * Store a manually-entered token and exchange for long-lived tokens.
 * Also discovers page_id and ig_user_id from the user's accounts.
 */
export async function storeToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<StoreTokenResult> {
  // Exchange for long-lived user token
  const longLivedResponse = await graphAPIGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const userToken = longLivedResponse.access_token;
  const expiresIn = longLivedResponse.expires_in || 5184000; // 60 days default

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Get page access token and page_id
  const pagesResponse = await graphAPIGet("/me/accounts", {
    access_token: userToken,
  });

  const firstPage = pagesResponse.data?.[0];
  const pageToken = firstPage?.access_token || userToken;
  const pageId: string | undefined = firstPage?.id;
  const pageName: string | null = firstPage?.name || null;

  // Discover Instagram Business Account linked to the page
  let igUserId: string | undefined;
  if (pageId) {
    try {
      const igResponse = await graphAPIGet(`/${pageId}`, {
        fields: "instagram_business_account",
        access_token: pageToken,
      });
      igUserId = igResponse.instagram_business_account?.id;
    } catch {
      // IG not linked — not fatal
    }
  }

  const tokens: MetaTokens = {
    page_access_token: pageToken,
    user_access_token: userToken,
    token_expires_at: expiresAt,
    last_refreshed: new Date().toISOString(),
    page_id: pageId,
    ig_user_id: igUserId,
  };

  saveTokens(tokens);
  return { tokens, page_name: pageName, ig_linked: !!igUserId };
}

/**
 * Refresh the user token if it's close to expiry.
 * Returns true if refreshed.
 */
export async function refreshTokenIfNeeded(
  appId: string,
  appSecret: string
): Promise<boolean> {
  const tokens = loadTokens();
  if (!tokens) return false;

  const expiresAt = new Date(tokens.token_expires_at);
  const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  // Refresh if less than 7 days until expiry
  if (daysUntilExpiry > 7) return false;

  const response = await graphAPIGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: tokens.user_access_token,
  });

  if (response.access_token) {
    tokens.user_access_token = response.access_token;
    tokens.token_expires_at = new Date(
      Date.now() + (response.expires_in || 5184000) * 1000
    ).toISOString();
    tokens.last_refreshed = new Date().toISOString();
    saveTokens(tokens);
    return true;
  }

  return false;
}

/**
 * Ensure tokens exist, aren't expired, and auto-refresh if close to expiry.
 * Returns token status info.
 */
export async function ensureValidTokens(
  appId: string,
  appSecret: string
): Promise<{
  valid: boolean;
  days_until_expiry: number;
  refreshed: boolean;
  page_id: string | null;
  ig_user_id: string | null;
  error?: string;
}> {
  const tokens = loadTokens();
  if (!tokens) {
    return {
      valid: false,
      days_until_expiry: 0,
      refreshed: false,
      page_id: null,
      ig_user_id: null,
      error: "No tokens found. Run smi_auth first.",
    };
  }

  const expiresAt = new Date(tokens.token_expires_at);
  let daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry <= 0) {
    return {
      valid: false,
      days_until_expiry: 0,
      refreshed: false,
      page_id: tokens.page_id || null,
      ig_user_id: tokens.ig_user_id || null,
      error: "Token has expired. Run smi_auth with a new short-lived token.",
    };
  }

  let refreshed = false;
  if (daysUntilExpiry <= 7) {
    refreshed = await refreshTokenIfNeeded(appId, appSecret);
    if (refreshed) {
      const updated = loadTokens();
      if (updated) {
        daysUntilExpiry =
          (new Date(updated.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      }
    }
  }

  return {
    valid: true,
    days_until_expiry: Math.round(daysUntilExpiry * 10) / 10,
    refreshed,
    page_id: tokens.page_id || null,
    ig_user_id: tokens.ig_user_id || null,
  };
}

/**
 * Make a GET request to the Meta Graph API.
 */
export async function graphAPIGet(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<GraphAPIResponse> {
  const tokens = loadTokens();
  if (!params.access_token && tokens) {
    params.access_token = tokens.user_access_token;
  }

  const queryString = new URLSearchParams(params).toString();
  const fullUrl = `${GRAPH_API_BASE}${endpoint}?${queryString}`;

  return makeRequest("GET", fullUrl);
}

/**
 * Make a POST request to the Meta Graph API.
 */
export async function graphAPIPost(
  endpoint: string,
  data: Record<string, any> = {},
  tokenType: "user" | "page" = "user"
): Promise<GraphAPIResponse> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("No Meta API tokens found. Run 'smi auth' first.");
  }

  if (!data.access_token) {
    data.access_token =
      tokenType === "page" ? tokens.page_access_token : tokens.user_access_token;
  }

  const fullUrl = `${GRAPH_API_BASE}${endpoint}`;
  return makeRequest("POST", fullUrl, data);
}

/**
 * Low-level HTTP request helper.
 */
function makeRequest(
  method: string,
  requestUrl: string,
  body?: Record<string, any>
): Promise<GraphAPIResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(
              new Error(`Meta API Error: ${parsed.error.message} (code: ${parsed.error.code})`)
            );
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse Meta API response: ${data}`));
        }
      });
    });

    req.on("error", reject);

    if (body && method === "POST") {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Poll for media container status (used for Instagram async uploads).
 */
export async function pollMediaStatus(
  containerId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await graphAPIGet(`/${containerId}`, {
      fields: "status_code",
    });

    const status = response.status_code;
    if (status === "FINISHED") return "FINISHED";
    if (status === "ERROR") throw new Error(`Media container ${containerId} failed processing`);

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Media container ${containerId} timed out after ${maxAttempts} attempts`);
}
