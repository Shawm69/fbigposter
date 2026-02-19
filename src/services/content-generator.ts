import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import { readJSON, writeJSON, ensureDir } from "../storage/files";
import { schedulePath, stagingDir, Pipeline } from "../storage/paths";
import { loadConstitution } from "../tiers/constitution";
import { loadTactics } from "../tiers/tactics";
import { buildGenerationContextTool } from "../tools/build-generation-context";
import { PluginConfig } from "../../config-schema";
import { ScheduleEntry, DailySchedule } from "./scheduler";
import { logEvent } from "./event-log";

let generatorTask: cron.ScheduledTask | null = null;

/**
 * Start the content generator service.
 * Triggers after nightly analysis (e.g., 3:00 AM) to generate today's content.
 *
 * In production, this service triggers the agent to:
 * 1. Call smi_build_generation_context to load the three tiers
 * 2. Craft Sora/Grok prompts informed by Tactics evidence
 * 3. Use browser automation to generate media
 * 4. Save media to staging for user review
 * 5. Create the daily schedule with posting times
 *
 * This implementation creates the schedule manifest and placeholders
 * that the agent fills in during its overnight content creation session.
 */
export function startContentGenerator(config: PluginConfig): void {
  if (generatorTask) {
    generatorTask.stop();
  }

  // Run 1 hour after nightly analysis
  const [hour, minute] = config.schedule.nightly_analysis_time.split(":");
  const genHour = (parseInt(hour) + 1) % 24;
  const cronExpr = `${minute} ${genHour} * * *`;

  generatorTask = cron.schedule(cronExpr, async () => {
    await runContentGeneration(config);
  }, {
    timezone: config.schedule.timezone,
  });

  console.log(
    `[smi-content-generator] Started — scheduled at ${String(genHour).padStart(2, "0")}:${minute} ${config.schedule.timezone}`
  );
}

/**
 * Stop the content generator service.
 */
export function stopContentGenerator(): void {
  if (generatorTask) {
    generatorTask.stop();
    generatorTask = null;
    console.log("[smi-content-generator] Stopped");
  }
}

/**
 * Run content generation for today.
 * Creates the daily schedule manifest and prepares generation contexts
 * for the agent to use during content creation.
 */
export async function runContentGeneration(
  config: PluginConfig
): Promise<{
  date: string;
  items_planned: number;
  generation_contexts: Array<{
    pipeline: Pipeline;
    context_ready: boolean;
    mcp_tool?: "generate_image" | "generate_video";
    recommended_aspect_ratio?: string;
  }>;
}> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  console.log(`[smi-content-generator] Generating content plan for ${dateStr}`);

  // Ensure staging directory exists
  const todayStagingDir = path.join(stagingDir(), dateStr);
  ensureDir(todayStagingDir);

  const scheduleItems: ScheduleEntry[] = [];
  const generationContexts: Array<{
    pipeline: Pipeline;
    context_ready: boolean;
    mcp_tool?: "generate_image" | "generate_video";
    recommended_aspect_ratio?: string;
  }> = [];

  const pipelines: Pipeline[] = ["reels", "image_posts", "stories"];

  for (const pipeline of pipelines) {
    const pipelineConfig = config.pipelines[pipeline];
    if (!pipelineConfig.enabled) {
      generationContexts.push({ pipeline, context_ready: false });
      continue;
    }

    try {
      // Build generation context for the agent
      const contextResult = await buildGenerationContextTool({ pipeline });

      if (!contextResult.success || !contextResult.context) {
        console.error(
          `[smi-content-generator] Failed to build context for ${pipeline}: ${contextResult.error}`
        );
        generationContexts.push({ pipeline, context_ready: false });
        continue;
      }

      // Map pipeline to MCP browser tool
      const mcpTool: "generate_image" | "generate_video" =
        pipeline === "reels" ? "generate_video" : "generate_image";
      const aspectRatioMap: Record<Pipeline, string> = {
        reels: "9:16",
        image_posts: "1:1",
        stories: "9:16",
      };

      generationContexts.push({
        pipeline,
        context_ready: true,
        mcp_tool: mcpTool,
        recommended_aspect_ratio: aspectRatioMap[pipeline],
      });

      // Get posting times from tactics
      const tactics = loadTactics(pipeline);
      const postingSlots = tactics.posting_times.best_slots;

      // Create schedule entries for each daily target post
      const dailyTarget = pipelineConfig.daily_target;

      for (let i = 0; i < dailyTarget; i++) {
        const postingTime = postingSlots[i % postingSlots.length] || "12:00";
        const postType = pipeline === "reels" ? "reel"
          : pipeline === "stories" ? "story"
          : "feed";

        const itemId = uuidv4();

        scheduleItems.push({
          id: itemId,
          pipeline,
          media_path: path.join(todayStagingDir, `${pipeline}-${itemId}.pending`),
          caption: "", // To be filled by agent during content creation
          hashtags: [],
          post_type: postType as "feed" | "reel" | "story",
          posting_time: postingTime,
          status: "pending",
        });
      }

      console.log(
        `[smi-content-generator] ${pipeline}: ${dailyTarget} items planned at times ${postingSlots.slice(0, dailyTarget).join(", ")}`
      );
    } catch (err: any) {
      console.error(`[smi-content-generator] Error planning ${pipeline}: ${err.message}`);
      generationContexts.push({ pipeline, context_ready: false });
    }
  }

  // Save the daily schedule
  const dailySchedule: DailySchedule = {
    date: dateStr,
    items: scheduleItems,
  };

  writeJSON(schedulePath(dateStr), dailySchedule);

  // Save generation contexts for the agent to use
  const contextsPath = path.join(todayStagingDir, "generation-contexts.json");
  writeJSON(contextsPath, generationContexts);

  const readyCount = generationContexts.filter((c) => c.context_ready).length;
  console.log(
    `[smi-content-generator] Schedule created for ${dateStr}: ${scheduleItems.length} items across ${readyCount} pipelines`
  );

  logEvent({
    type: "content_plan_created",
    summary: `Content plan for ${dateStr}: ${scheduleItems.length} items across ${readyCount} pipelines`,
    details: { date: dateStr, items_planned: scheduleItems.length, pipelines: generationContexts },
  });

  return {
    date: dateStr,
    items_planned: scheduleItems.length,
    generation_contexts: generationContexts,
  };
}
