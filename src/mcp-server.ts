import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { z } from "zod";
import * as path from "path";

import { setWorkspaceRoot } from "./storage/paths";
import { readJSON } from "./storage/files";
import { PluginConfig, DEFAULT_CONFIG } from "../config-schema";

// Tools
import { setupStatusTool } from "./tools/setup-status";
import { configureTool } from "./tools/configure";
import { buildGenerationContextTool } from "./tools/build-generation-context";
import { generateContentTool } from "./tools/generate-content";
import { postContentTool } from "./tools/post-content";
import { collectMetricsTool } from "./tools/collect-metrics";
import { runAnalysisTool } from "./tools/run-analysis";
import { updateTacticsTool } from "./tools/update-tactics";
import { proposeSoulChangeTool } from "./tools/propose-soul-change";
import { reviewQueueTool } from "./tools/review-queue";
import { initTool } from "./tools/init";
import { authTool } from "./tools/auth";
import { testConnectionTool } from "./tools/test-connection";

// Background services
import { startScheduler, stopScheduler } from "./services/scheduler";
import { startMetricsCollector, stopMetricsCollector } from "./services/metrics-collector";
import { startNightlyAnalysis, stopNightlyAnalysis } from "./services/nightly-analysis";
import { startContentGenerator, stopContentGenerator } from "./services/content-generator";

// Token management
import { ensureValidTokens } from "./meta-api/client";
import * as cron from "node-cron";

// Event log
import { logEvent, getUnreadEvents, getRecentEvents } from "./services/event-log";

// ── Config ──

const WORKSPACE = process.env.SMI_WORKSPACE || path.join(process.cwd(), "workspace");
const PORT = parseInt(process.env.SMI_PORT || "3002", 10);

function loadConfig(): PluginConfig {
  const configPath = path.join(WORKSPACE, "config.json");
  return readJSON<PluginConfig>(configPath) || DEFAULT_CONFIG;
}

// ── MCP Server Factory (stateless mode — new server per request) ──

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "social-media-influencer",
    version: "1.0.0",
  });

  // ── Tool: smi_setup_status ──

  server.tool(
    "smi_setup_status",
    "Check setup progress. Returns what's configured, what's missing, and the next step.",
    {},
    async () => {
      const result = setupStatusTool();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_init ──

  server.tool(
    "smi_init",
    "Initialize the workspace: create directories and copy template files. Safe to re-run (idempotent).",
    {},
    async () => {
      const result = initTool();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_auth ──

  server.tool(
    "smi_auth",
    "Authenticate with Meta API. Exchanges a short-lived token for a long-lived one, discovers FB Page and IG Business Account, and saves credentials.",
    {
      app_id: z.string().describe("Meta App ID from Developer Console"),
      app_secret: z.string().describe("Meta App Secret from Developer Console"),
      short_lived_token: z.string().describe("Short-lived user access token from Graph API Explorer"),
    },
    async (params) => {
      const result = await authTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_test_connection ──

  server.tool(
    "smi_test_connection",
    "Verify Meta API connectivity. Tests Facebook Page access and Instagram Business Account access, reports token expiry.",
    {},
    async () => {
      const result = await testConnectionTool();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_configure ──

  server.tool(
    "smi_configure",
    "Set a value in config, soul, constitution, tactics, or status. Used during setup and ongoing configuration.",
    {
      section: z.enum(["config", "soul", "constitution", "tactics", "status"]),
      path: z.string().optional().describe("Dot-path to the field, e.g. 'brand_voice.tone'"),
      value: z.any().describe("The value to set"),
      pipeline: z.string().optional().describe("Required for tactics section: reels, image_posts, or stories"),
      reason: z.string().optional().describe("Reason for change (logged in soul change_log)"),
    },
    async (params) => {
      const result = configureTool({
        section: params.section,
        path: params.path,
        value: params.value,
        pipeline: params.pipeline,
        reason: params.reason,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_build_generation_context ──

  server.tool(
    "smi_build_generation_context",
    "Load the three-tier context (Constitution + Soul + Tactics) for a pipeline. Returns the full prompt template.",
    {
      pipeline: z.enum(["reels", "image_posts", "stories"]),
    },
    async (params) => {
      const result = await buildGenerationContextTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_generate_content ──

  server.tool(
    "smi_generate_content",
    "Build creative context for a pipeline and prepare staging. Returns the prompt template, staging dir, and which media tool to call next (generate_image or generate_video).",
    {
      pipeline: z.enum(["reels", "image_posts", "stories"]),
    },
    async (params) => {
      const result = await generateContentTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_post_content ──

  server.tool(
    "smi_post_content",
    "Publish content to Instagram and Facebook. Validates against Constitution, uploads media, logs to history.",
    {
      pipeline: z.enum(["reels", "image_posts", "stories"]),
      media_path: z.string().describe("Path to the media file to post"),
      caption: z.string(),
      hashtags: z.array(z.string()),
      post_type: z.enum(["feed", "reel", "story"]),
      content_pillar: z.string().optional().describe("Which content pillar this serves"),
      media_prompt: z.string().optional().describe(
        "The Sora or Grok Imagine prompt used to generate the media. Pass this for full generation traceability."
      ),
      pipeline_template: z.string().optional().describe(
        "The pipeline_template from smi_generate_content. Pass this to snapshot the creative context."
      ),
    },
    async (params) => {
      const config = loadConfig();
      const result = await postContentTool(params, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_collect_metrics ──

  server.tool(
    "smi_collect_metrics",
    "Ingest engagement metrics for posts. Primary mode: pass scraped_posts from scrape_facebook_metrics output to match and store FB-native metrics (views, viewers, engagement, distribution, watch_time_ms). Legacy mode: fetch from Meta Graph API by post_id/pipeline (limited data).",
    {
      scraped_posts: z.array(z.object({
        title: z.string().describe("Post caption/title text from FB"),
        date: z.string().describe("Post date string from FB"),
        views: z.number(),
        viewers: z.number().describe("Unique reach"),
        engagement: z.number().describe("Aggregate reactions + comments + shares"),
        comments: z.number(),
        net_follows: z.number(),
        impressions: z.number(),
        distribution: z.number().nullable().describe("FB algorithm quality score, e.g. +0.3 = 30% above baseline"),
        watch_time_ms: z.number().describe("Total watch time in ms across all viewers"),
      })).optional().describe("Output from scrape_facebook_metrics — preferred mode"),
      post_id: z.string().optional().describe("Legacy: specific post ID for Graph API collection"),
      pipeline: z.string().optional().describe("Legacy: filter to a specific pipeline"),
      since: z.string().optional().describe("Legacy: only collect for posts after this ISO date"),
    },
    async (params) => {
      const config = loadConfig();
      const result = await collectMetricsTool(params, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_run_analysis ──

  server.tool(
    "smi_run_analysis",
    "Analyze performance for a pipeline. Returns findings on posting times, captions, hashtags, content pillars, engagement profile, and version trends.",
    {
      pipeline: z.enum(["reels", "image_posts", "stories"]),
      lookback_days: z.number().optional().describe("How many days back to analyze (default 30)"),
    },
    async (params) => {
      const result = await runAnalysisTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_update_tactics ──

  server.tool(
    "smi_update_tactics",
    "Apply analysis findings to a pipeline's tactics. Increments version, records evidence.",
    {
      pipeline: z.enum(["reels", "image_posts", "stories"]),
      updates: z.array(z.object({
        field: z.string().describe("Dot-path to the tactics field"),
        new_value: z.any(),
        evidence: z.string().describe("Evidence justifying this change"),
      })),
    },
    async (params) => {
      const result = await updateTacticsTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_propose_soul_change ──

  server.tool(
    "smi_propose_soul_change",
    "Queue a Soul (brand identity) change for human approval. Soul changes are never auto-applied.",
    {
      field: z.string().describe("Dot-path to the Soul property, e.g. 'brand_voice.tone'"),
      proposed_value: z.any(),
      evidence: z.string().describe("Data-backed justification for the change"),
      supporting_posts: z.array(z.string()).describe("Post IDs that support this proposal"),
    },
    async (params) => {
      const result = await proposeSoulChangeTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_review_queue ──

  server.tool(
    "smi_review_queue",
    "List pending items: soul change proposals and/or scheduled content awaiting review.",
    {
      type: z.enum(["soul_proposals", "scheduled_content", "all"]).optional(),
    },
    async (params) => {
      const result = await reviewQueueTool({ type: params.type });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: smi_get_notifications ──

  server.tool(
    "smi_get_notifications",
    "Get unread background events (posts published, analysis results, errors). Call this periodically to stay informed about what happened while you weren't looking.",
    {
      limit: z.number().optional().describe("Max events to return (default: all unread)"),
    },
    async (params) => {
      const events = params.limit
        ? getRecentEvents(params.limit)
        : getUnreadEvents();
      return {
        content: [{
          type: "text",
          text: events.length > 0
            ? JSON.stringify(events, null, 2)
            : "No unread events.",
        }],
      };
    }
  );

  return server;
}

// ── Start ──

async function main() {
  setWorkspaceRoot(WORKSPACE);
  const config = loadConfig();

  // Start background services if setup is complete
  const status = setupStatusTool();
  if (status.setup_complete) {
    startScheduler(config);
    startMetricsCollector(config);
    startNightlyAnalysis(config);
    startContentGenerator(config);
    logEvent({ type: "service_started", summary: "All background services started" });
    console.log("[smi] Background services started");

    // Token health check at startup
    if (config.meta.app_id && config.meta.app_secret) {
      try {
        const tokenStatus = await ensureValidTokens(config.meta.app_id, config.meta.app_secret);
        if (!tokenStatus.valid) {
          console.warn(`[smi] Token invalid: ${tokenStatus.error}`);
          logEvent({ type: "token_warning", summary: `Token invalid: ${tokenStatus.error}` });
        } else if (tokenStatus.days_until_expiry < 14) {
          console.warn(`[smi] Token expires in ${tokenStatus.days_until_expiry} days`);
          logEvent({ type: "token_warning", summary: `Token expires in ${tokenStatus.days_until_expiry} days` });
        }
      } catch (err: any) {
        console.warn(`[smi] Token check failed: ${err.message}`);
      }
    }

    // Daily token refresh at noon
    if (config.meta.app_id && config.meta.app_secret) {
      cron.schedule("0 12 * * *", async () => {
        try {
          const tokenStatus = await ensureValidTokens(config.meta.app_id, config.meta.app_secret);
          if (tokenStatus.valid && tokenStatus.days_until_expiry < 14) {
            logEvent({ type: "token_warning", summary: `Token expires in ${tokenStatus.days_until_expiry} days` });
          }
        } catch {}
      }, { timezone: config.schedule.timezone });
    }
  } else {
    console.log(`[smi] Setup incomplete (next step: ${status.next_step}) — background services skipped`);
  }

  // HTTP server — stateless MCP (new McpServer + transport per request)
  const httpServer = createServer(async (req, res) => {
    const url = req.url?.split("?")[0];
    if (url === "/mcp") {
      try {
        const mcpServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode
        });
        res.on("close", () => { transport.close(); });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err: any) {
        console.error("[smi] MCP request error:", err.message);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
    } else if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: 14 }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`[smi] MCP server listening on http://localhost:${PORT}/mcp`);
    console.log(`[smi] Workspace: ${WORKSPACE}`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    stopScheduler();
    stopMetricsCollector();
    stopNightlyAnalysis();
    stopContentGenerator();
    httpServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[smi] Fatal error:", err);
  process.exit(1);
});
