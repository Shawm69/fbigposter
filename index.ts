import * as fs from "fs";
import * as path from "path";
import { PluginConfig, DEFAULT_CONFIG, ConfigSchema } from "./config-schema";
import { setWorkspaceRoot, getWorkspaceRoot, allWorkspaceDirs } from "./src/storage/paths";
import { ensureDir, copyFile, fileExists, readJSON, writeJSON } from "./src/storage/files";

// Tools
import { buildGenerationContextTool } from "./src/tools/build-generation-context";
import { postContentTool } from "./src/tools/post-content";
import { collectMetricsTool } from "./src/tools/collect-metrics";
import { runAnalysisTool } from "./src/tools/run-analysis";
import { updateTacticsTool } from "./src/tools/update-tactics";
import { proposeSoulChangeTool } from "./src/tools/propose-soul-change";
import { reviewQueueTool } from "./src/tools/review-queue";
import { generateContentTool } from "./src/tools/generate-content";
import { setupStatusTool } from "./src/tools/setup-status";
import { configureTool } from "./src/tools/configure";

// Services
import { startScheduler, stopScheduler } from "./src/services/scheduler";
import { startMetricsCollector, stopMetricsCollector } from "./src/services/metrics-collector";
import { startNightlyAnalysis, stopNightlyAnalysis } from "./src/services/nightly-analysis";
import { startContentGenerator, stopContentGenerator } from "./src/services/content-generator";
import { getUnreadEvents, getRecentEvents } from "./src/services/event-log";

// Meta API
import {
  storeToken,
  ensureValidTokens,
  loadTokens,
  graphAPIGet,
} from "./src/meta-api/client";

// Tier management
import { updateProposalStatus } from "./src/tiers/soul";

/**
 * OpenClaw Plugin: Social Media Influencer
 *
 * Turns any agent into a social media influencer on Facebook and Instagram
 * with a three-tier learning system (Constitution → Soul → Tactics).
 */

export interface PluginContext {
  config: PluginConfig;
  workspaceRoot: string;
}

let pluginConfig: PluginConfig = DEFAULT_CONFIG;

// ═══════════════════════════════════════════════
// Plugin Lifecycle
// ═══════════════════════════════════════════════

/**
 * Initialize the plugin with configuration.
 * If a config.json exists at the workspace root, it is loaded as the base config.
 */
export function activate(config: Partial<PluginConfig>, workspaceRoot?: string): void {
  if (workspaceRoot) {
    setWorkspaceRoot(workspaceRoot);
  }

  // Load persisted config from workspace if it exists
  const persistedConfigPath = path.join(workspaceRoot || process.cwd(), "config.json");
  const persisted = readJSON<Partial<PluginConfig>>(persistedConfigPath);
  const base = persisted ? { ...DEFAULT_CONFIG, ...persisted } : DEFAULT_CONFIG;

  pluginConfig = { ...base, ...config } as PluginConfig;

  console.log("[social-media-influencer] Plugin activated");
}

/**
 * Start all background services.
 */
export function startServices(): void {
  startScheduler(pluginConfig);
  startMetricsCollector(pluginConfig);
  startNightlyAnalysis(pluginConfig);
  startContentGenerator(pluginConfig);
  console.log("[social-media-influencer] All services started");
}

/**
 * Stop all background services.
 */
export function stopServices(): void {
  stopScheduler();
  stopMetricsCollector();
  stopNightlyAnalysis();
  stopContentGenerator();
  console.log("[social-media-influencer] All services stopped");
}

// ═══════════════════════════════════════════════
// CLI Commands
// ═══════════════════════════════════════════════

/**
 * Initialize workspace: create directories and copy default templates.
 */
export function initWorkspace(workspaceRoot: string): { success: boolean; message: string } {
  setWorkspaceRoot(workspaceRoot);

  // Create all required directories
  for (const dir of allWorkspaceDirs()) {
    ensureDir(dir);
  }

  // Copy default templates if they don't exist
  const pluginDataDir = path.join(__dirname, "data");
  const templateMap: Record<string, string> = {
    "constitution.json": path.join(workspaceRoot, "tiers", "constitution.json"),
    "soul.json": path.join(workspaceRoot, "tiers", "soul.json"),
    "tactics/reels.json": path.join(workspaceRoot, "tiers", "tactics", "reels.json"),
    "tactics/image-posts.json": path.join(workspaceRoot, "tiers", "tactics", "image-posts.json"),
    "tactics/stories.json": path.join(workspaceRoot, "tiers", "tactics", "stories.json"),
  };

  let copiedCount = 0;
  for (const [src, dest] of Object.entries(templateMap)) {
    if (!fileExists(dest)) {
      const srcPath = path.join(pluginDataDir, src);
      if (fileExists(srcPath)) {
        copyFile(srcPath, dest);
        copiedCount++;
      }
    }
  }

  // Initialize empty queue file
  const queuePath = path.join(workspaceRoot, "queue", "soul-proposals.json");
  if (!fileExists(queuePath)) {
    writeJSON(queuePath, []);
  }

  return {
    success: true,
    message: `Workspace initialized at ${workspaceRoot}. ${copiedCount} template(s) copied. Edit tiers/constitution.json and tiers/soul.json to configure your brand.`,
  };
}

/**
 * Store Meta API authentication token.
 */
export async function authCommand(
  token: string,
  appId?: string,
  appSecret?: string
): Promise<{ success: boolean; message: string; page_id?: string; ig_user_id?: string; ig_linked?: boolean }> {
  const id = appId || pluginConfig.meta.app_id;
  const secret = appSecret || pluginConfig.meta.app_secret;

  if (!id || !secret) {
    return { success: false, message: "app_id and app_secret are required. Pass them as parameters or set in config." };
  }

  try {
    const result = await storeToken(token, id, secret);

    // Persist discovered IDs into config.json
    if (result.tokens.page_id || result.tokens.ig_user_id) {
      pluginConfig.meta.page_id = result.tokens.page_id || pluginConfig.meta.page_id;
      pluginConfig.meta.ig_user_id = result.tokens.ig_user_id || pluginConfig.meta.ig_user_id;
      pluginConfig.meta.app_id = id;
      pluginConfig.meta.app_secret = secret;

      const configPath = path.join(getWorkspaceRoot(), "config.json");
      writeJSON(configPath, pluginConfig);
    }

    const igStatus = result.ig_linked
      ? `Instagram Business Account linked (${result.tokens.ig_user_id})`
      : "Instagram NOT linked — connect an IG Business Account to your Facebook Page first";

    return {
      success: true,
      message: [
        `Tokens stored. Expires: ${result.tokens.token_expires_at}`,
        result.page_name ? `Page: "${result.page_name}" (${result.tokens.page_id})` : "No Facebook Page found",
        igStatus,
      ].join("\n"),
      page_id: result.tokens.page_id,
      ig_user_id: result.tokens.ig_user_id,
      ig_linked: result.ig_linked,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to store token: ${err.message}`,
    };
  }
}

// ═══════════════════════════════════════════════
// Tool Registration
// ═══════════════════════════════════════════════

/**
 * Get all tools provided by this plugin.
 * Each tool is a { name, description, parameters, handler } object.
 */
export function getTools() {
  return [
    // ── Setup & Auth tools ──────────────────────────
    {
      name: "smi_init",
      description:
        "Initialize the Social Media Influencer workspace. Creates directories and copies default tier templates (Constitution, Soul, Tactics).",
      parameters: {
        type: "object",
        properties: {
          workspace_path: {
            type: "string",
            description: "Absolute path for the workspace root directory",
          },
        },
        required: ["workspace_path"],
      },
      handler: (params: { workspace_path: string }) => initWorkspace(params.workspace_path),
    },
    {
      name: "smi_auth",
      description:
        "Authenticate with Meta Graph API. Takes a short-lived token (from Graph API Explorer), exchanges it for a long-lived token, and discovers your Facebook Page ID and Instagram Business Account ID.",
      parameters: {
        type: "object",
        properties: {
          short_lived_token: {
            type: "string",
            description: "Short-lived user access token from Graph API Explorer",
          },
          app_id: {
            type: "string",
            description: "Meta App ID from Developer Console",
          },
          app_secret: {
            type: "string",
            description: "Meta App Secret from Developer Console",
          },
        },
        required: ["short_lived_token", "app_id", "app_secret"],
      },
      handler: async (params: { short_lived_token: string; app_id: string; app_secret: string }) =>
        authCommand(params.short_lived_token, params.app_id, params.app_secret),
    },
    {
      name: "smi_test_connection",
      description:
        "Read-only diagnostic: verifies stored tokens are valid, checks Facebook Page access, reports Instagram linkage status, and shows days until token expiry.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        try {
          const tokenStatus = await ensureValidTokens(
            pluginConfig.meta.app_id,
            pluginConfig.meta.app_secret
          );

          if (!tokenStatus.valid) {
            return { success: false, message: tokenStatus.error, ...tokenStatus };
          }

          // Verify page access
          let pageStatus = "No page_id configured";
          const pageId = tokenStatus.page_id || pluginConfig.meta.page_id;
          if (pageId) {
            try {
              const page = await graphAPIGet(`/${pageId}`, { fields: "name,id" });
              pageStatus = `Page OK: "${page.name}" (${page.id})`;
            } catch (err: any) {
              pageStatus = `Page error: ${err.message}`;
            }
          }

          // Verify IG access
          let igStatus = "No ig_user_id configured";
          const igId = tokenStatus.ig_user_id || pluginConfig.meta.ig_user_id;
          if (igId) {
            try {
              const ig = await graphAPIGet(`/${igId}`, { fields: "username,id" });
              igStatus = `Instagram OK: @${ig.username} (${ig.id})`;
            } catch (err: any) {
              igStatus = `Instagram error: ${err.message}`;
            }
          }

          return {
            success: true,
            token_valid: true,
            days_until_expiry: tokenStatus.days_until_expiry,
            token_refreshed: tokenStatus.refreshed,
            page: pageStatus,
            instagram: igStatus,
          };
        } catch (err: any) {
          return { success: false, message: `Connection test failed: ${err.message}` };
        }
      },
    },
    // ── Setup & Status tools ──────────────────────
    {
      name: "smi_setup_status",
      description:
        "Check the current setup state and operating mode. Returns what's configured vs missing, the current mode (setup/supervised/autonomous), and the next setup step needed. Call this at the start of every conversation.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: () => setupStatusTool(),
    },
    {
      name: "smi_configure",
      description:
        "Universal configuration setter. Writes a value to any section of the plugin's configuration: config (config.json), soul (brand identity, audience, content pillars, visual identity), constitution (safety rails), tactics (per-pipeline), or status (wizard progress). Use dot-path notation for nested fields (e.g., 'brand_voice.tone').",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["config", "soul", "constitution", "tactics", "status"],
            description: "Which configuration section to write to",
          },
          path: {
            type: "string",
            description: "Dot-path to the field (e.g., 'brand_voice.tone'). Omit to set at root level.",
          },
          value: {
            description: "The value to set",
          },
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
            description: "Required when section is 'tactics'",
          },
          reason: {
            type: "string",
            description: "Reason for the change (logged in Soul change_log)",
          },
        },
        required: ["section", "value"],
      },
      handler: (params: {
        section: "config" | "soul" | "constitution" | "tactics" | "status";
        path?: string;
        value: any;
        pipeline?: string;
        reason?: string;
      }) => configureTool(params),
    },
    // ── Content pipeline tools ──────────────────────
    {
      name: "smi_build_generation_context",
      description:
        "Assemble the current three-tier context (Constitution + Soul + Tactics) for a content pipeline. Returns rules, voice, and evidence-backed creative direction for content generation.",
      parameters: {
        type: "object",
        properties: {
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
            description: "Which content pipeline to build context for",
          },
        },
        required: ["pipeline"],
      },
      handler: buildGenerationContextTool,
    },
    {
      name: "smi_post_content",
      description:
        "Publish content to both Facebook and Instagram via Meta Graph API. Validates against Constitution, uploads media, and logs to history.",
      parameters: {
        type: "object",
        properties: {
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
          },
          media_path: {
            type: "string",
            description: "Path to the media file to post",
          },
          caption: {
            type: "string",
            description: "Post caption text",
          },
          hashtags: {
            type: "array",
            items: { type: "string" },
            description: "Hashtags to include",
          },
          post_type: {
            type: "string",
            enum: ["feed", "reel", "story"],
          },
        },
        required: ["pipeline", "media_path", "caption", "hashtags", "post_type"],
      },
      handler: (params: any) => postContentTool(params, pluginConfig),
    },
    {
      name: "smi_collect_metrics",
      description:
        "Harvest engagement data for a specific post or all recent posts. Updates metrics in history/posts.jsonl.",
      parameters: {
        type: "object",
        properties: {
          post_id: {
            type: "string",
            description: "Specific post ID to collect metrics for (optional)",
          },
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
            description: "Filter by pipeline (optional)",
          },
          since: {
            type: "string",
            description: "ISO 8601 date — only collect for posts after this date (optional)",
          },
        },
      },
      handler: (params: any) => collectMetricsTool(params, pluginConfig),
    },
    {
      name: "smi_run_analysis",
      description:
        "Run analysis for a single pipeline. Examines engagement patterns, posting times, caption effectiveness, hashtag performance, and more. Returns findings with evidence.",
      parameters: {
        type: "object",
        properties: {
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
            description: "Which pipeline to analyze",
          },
          lookback_days: {
            type: "number",
            description: "How many days of history to analyze (default: 30)",
          },
        },
        required: ["pipeline"],
      },
      handler: runAnalysisTool,
    },
    {
      name: "smi_update_tactics",
      description:
        "Apply analyzed findings to a pipeline's tactics file. Increments version, applies updates with evidence, appends to learnings.",
      parameters: {
        type: "object",
        properties: {
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
          },
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "Dot-path to the tactics field" },
                new_value: { description: "New value for the field" },
                evidence: { type: "string", description: "Evidence justifying this change" },
              },
              required: ["field", "new_value", "evidence"],
            },
          },
        },
        required: ["pipeline", "updates"],
      },
      handler: updateTacticsTool,
    },
    {
      name: "smi_propose_soul_change",
      description:
        "Queue a Tier 2 Soul change for human approval. Soul changes require strong evidence and are NOT auto-applied.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            description: 'Dot-path to the Soul property (e.g., "brand_voice.tone")',
          },
          proposed_value: {
            description: "The proposed new value",
          },
          evidence: {
            type: "string",
            description: "Evidence-backed justification for the change",
          },
          supporting_posts: {
            type: "array",
            items: { type: "string" },
            description: "Post IDs that support this proposal",
          },
        },
        required: ["field", "proposed_value", "evidence"],
      },
      handler: proposeSoulChangeTool,
    },
    {
      name: "smi_review_queue",
      description:
        "List pending items: soul change proposals and/or scheduled content awaiting posting.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["soul_proposals", "scheduled_content", "all"],
            description: "What type of pending items to show (default: all)",
          },
        },
      },
      handler: reviewQueueTool,
    },
    {
      name: "smi_generate_content",
      description:
        "Build three-tier generation context for a pipeline and prepare for media generation. Returns creative direction, staging directory, and which MCP browser tool to call (generate_image or generate_video).",
      parameters: {
        type: "object",
        properties: {
          pipeline: {
            type: "string",
            enum: ["reels", "image_posts", "stories"],
            description: "Which content pipeline to generate for",
          },
        },
        required: ["pipeline"],
      },
      handler: generateContentTool,
    },
    {
      name: "smi_get_notifications",
      description:
        "Get unread background events (posts published, analysis results, errors). Call this periodically to stay informed about what happened while you weren't looking.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max events to return (default: all unread)",
          },
        },
      },
      handler: (params: { limit?: number }) => {
        const events = params.limit
          ? getRecentEvents(params.limit)
          : getUnreadEvents();
        return { events, count: events.length };
      },
    },
  ];
}

/**
 * Get all background services provided by this plugin.
 */
export function getServices() {
  return [
    {
      name: "smi-scheduler",
      description: "Posts staged content at optimal times throughout the day",
      start: () => startScheduler(pluginConfig),
      stop: stopScheduler,
    },
    {
      name: "smi-metrics-collector",
      description: "Polls Meta API for post metrics at configured intervals",
      start: () => startMetricsCollector(pluginConfig),
      stop: stopMetricsCollector,
    },
    {
      name: "smi-nightly-analysis",
      description: "Runs analysis passes and updates tactics (learning only)",
      start: () => startNightlyAnalysis(pluginConfig),
      stop: stopNightlyAnalysis,
    },
    {
      name: "smi-content-generator",
      description: "Triggers overnight content generation after analysis",
      start: () => startContentGenerator(pluginConfig),
      stop: stopContentGenerator,
    },
  ];
}

/**
 * Administrative actions (for human operator).
 */
export const admin = {
  /**
   * Approve a soul change proposal.
   */
  approveSoulChange: (proposalId: string) => updateProposalStatus(proposalId, "approved"),

  /**
   * Reject a soul change proposal.
   */
  rejectSoulChange: (proposalId: string) => updateProposalStatus(proposalId, "rejected"),
};

// ═══════════════════════════════════════════════
// OpenClaw Extension Entry Point
// ═══════════════════════════════════════════════

/**
 * Default export called by OpenClaw when loading the plugin.
 * Registers all tools and services via the OpenClaw API.
 */
export default function register(api: any) {
  const workspace =
    api.getWorkspacePath?.() ||
    process.env.SMI_WORKSPACE ||
    path.join(process.cwd(), "workspace");
  activate({}, workspace);

  // Register all tools
  for (const tool of getTools()) {
    api.registerAgentTool(tool);
  }

  // Register background services
  for (const service of getServices()) {
    api.registerService({ id: service.name, start: service.start, stop: service.stop });
  }
}

// Export everything needed
export { ConfigSchema, DEFAULT_CONFIG } from "./config-schema";
export type { PluginConfig } from "./config-schema";
export type { Pipeline } from "./src/storage/paths";
