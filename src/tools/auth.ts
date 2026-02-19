import * as path from "path";
import { readJSON, writeJSON } from "../storage/files";
import { getWorkspaceRoot } from "../storage/paths";
import { storeToken } from "../meta-api/client";
import { PluginConfig, DEFAULT_CONFIG } from "../../config-schema";

export interface AuthParams {
  app_id: string;
  app_secret: string;
  short_lived_token: string;
}

export interface AuthResult {
  success: boolean;
  page_name: string | null;
  ig_linked: boolean;
  page_id: string | null;
  ig_user_id: string | null;
  token_expires_at: string;
  troubleshooting?: string;
}

export async function authTool(params: AuthParams): Promise<AuthResult> {
  const { app_id, app_secret, short_lived_token } = params;

  // Validate inputs
  if (!app_id || !app_id.trim()) {
    return {
      success: false,
      page_name: null,
      ig_linked: false,
      page_id: null,
      ig_user_id: null,
      token_expires_at: "",
      troubleshooting: "app_id is required. Find it at https://developers.facebook.com/apps/",
    };
  }
  if (!app_secret || !app_secret.trim()) {
    return {
      success: false,
      page_name: null,
      ig_linked: false,
      page_id: null,
      ig_user_id: null,
      token_expires_at: "",
      troubleshooting: "app_secret is required. Find it under App Settings > Basic in the Meta Developer Console.",
    };
  }
  if (!short_lived_token || !short_lived_token.trim()) {
    return {
      success: false,
      page_name: null,
      ig_linked: false,
      page_id: null,
      ig_user_id: null,
      token_expires_at: "",
      troubleshooting: "short_lived_token is required. Generate one from the Graph API Explorer at https://developers.facebook.com/tools/explorer/",
    };
  }

  try {
    // Exchange token, discover page + IG, save tokens
    const result = await storeToken(short_lived_token, app_id, app_secret);

    // Save credentials to config.json for token refresh cron
    const configPath = path.join(getWorkspaceRoot(), "config.json");
    const config = readJSON<PluginConfig>(configPath) || { ...DEFAULT_CONFIG };
    config.meta.app_id = app_id;
    config.meta.app_secret = app_secret;
    config.meta.page_id = result.tokens.page_id || "";
    config.meta.ig_user_id = result.tokens.ig_user_id || "";
    writeJSON(configPath, config);

    return {
      success: true,
      page_name: result.page_name,
      ig_linked: result.ig_linked,
      page_id: result.tokens.page_id || null,
      ig_user_id: result.tokens.ig_user_id || null,
      token_expires_at: result.tokens.token_expires_at,
    };
  } catch (err: any) {
    const message = err.message || String(err);
    let troubleshooting = message;

    // Parse common Meta API error codes
    if (message.includes("code: 190")) {
      troubleshooting =
        "Token is expired or invalid (Meta error 190). Generate a fresh short-lived token from the Graph API Explorer and try again.";
    } else if (message.includes("code: 100")) {
      troubleshooting =
        "Invalid parameters (Meta error 100). Double-check your app_id and app_secret match the app that generated the token.";
    } else if (message.includes("code: 4")) {
      troubleshooting =
        "Rate limit hit (Meta error 4). Wait a few minutes and try again.";
    }

    return {
      success: false,
      page_name: null,
      ig_linked: false,
      page_id: null,
      ig_user_id: null,
      token_expires_at: "",
      troubleshooting,
    };
  }
}
