import { loadTokens, graphAPIGet } from "../meta-api/client";

export interface TestConnectionResult {
  success: boolean;
  facebook: {
    connected: boolean;
    page_name: string | null;
    page_id: string | null;
  };
  instagram: {
    connected: boolean;
    ig_user_id: string | null;
    username: string | null;
  };
  token_status: {
    days_until_expiry: number;
  };
  error?: string;
}

export async function testConnectionTool(): Promise<TestConnectionResult> {
  // 1. Load tokens
  const tokens = loadTokens();
  if (!tokens) {
    return {
      success: false,
      facebook: { connected: false, page_name: null, page_id: null },
      instagram: { connected: false, ig_user_id: null, username: null },
      token_status: { days_until_expiry: 0 },
      error: "No tokens found. Run smi_auth first.",
    };
  }

  // 2. Check token expiry
  const expiresAt = new Date(tokens.token_expires_at);
  const daysUntilExpiry =
    Math.round(((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) * 10) / 10;

  if (daysUntilExpiry <= 0) {
    return {
      success: false,
      facebook: { connected: false, page_name: null, page_id: tokens.page_id || null },
      instagram: { connected: false, ig_user_id: tokens.ig_user_id || null, username: null },
      token_status: { days_until_expiry: 0 },
      error: "Token has expired. Run smi_auth with a new short-lived token.",
    };
  }

  // 3. Verify Facebook access
  let fbConnected = false;
  let pageName: string | null = null;
  let pageId: string | null = tokens.page_id || null;

  try {
    const pagesResponse = await graphAPIGet("/me/accounts");
    const firstPage = pagesResponse.data?.[0];
    if (firstPage) {
      fbConnected = true;
      pageName = firstPage.name || null;
      pageId = firstPage.id || pageId;
    }
  } catch {
    // FB access failed — fbConnected stays false
  }

  // 4. Verify Instagram access (if IG user ID is stored)
  let igConnected = false;
  let igUsername: string | null = null;

  if (tokens.ig_user_id) {
    try {
      const igResponse = await graphAPIGet(`/${tokens.ig_user_id}`, {
        fields: "username",
        access_token: tokens.page_access_token,
      });
      if (igResponse.username) {
        igConnected = true;
        igUsername = igResponse.username;
      }
    } catch {
      // IG access failed — igConnected stays false
    }
  }

  return {
    success: fbConnected,
    facebook: {
      connected: fbConnected,
      page_name: pageName,
      page_id: pageId,
    },
    instagram: {
      connected: igConnected,
      ig_user_id: tokens.ig_user_id || null,
      username: igUsername,
    },
    token_status: {
      days_until_expiry: daysUntilExpiry,
    },
  };
}
