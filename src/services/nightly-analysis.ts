import * as cron from "node-cron";
import { runAnalysisTool } from "../tools/run-analysis";
import { updateTacticsTool } from "../tools/update-tactics";
import { Pipeline } from "../storage/paths";
import { PluginConfig } from "../../config-schema";
import { logEvent } from "./event-log";

let analysisTask: cron.ScheduledTask | null = null;

const PIPELINES: Pipeline[] = ["reels", "image_posts", "stories"];

/**
 * Start the nightly analysis service.
 * Runs at the configured time (e.g., 2:00 AM) and performs three sequential
 * analysis passes — one for each pipeline.
 *
 * This is purely a LEARNING step. It does NOT plan specific posts.
 * It updates Tactics files with evidence-backed changes that indirectly
 * shape future content generation.
 */
export function startNightlyAnalysis(config: PluginConfig): void {
  if (analysisTask) {
    analysisTask.stop();
  }

  const [hour, minute] = config.schedule.nightly_analysis_time.split(":");
  const cronExpr = `${minute} ${hour} * * *`;

  analysisTask = cron.schedule(cronExpr, async () => {
    await runNightlyAnalysis(config);
  }, {
    timezone: config.schedule.timezone,
  });

  console.log(
    `[smi-nightly-analysis] Started — scheduled at ${config.schedule.nightly_analysis_time} ${config.schedule.timezone}`
  );
}

/**
 * Stop the nightly analysis service.
 */
export function stopNightlyAnalysis(): void {
  if (analysisTask) {
    analysisTask.stop();
    analysisTask = null;
    console.log("[smi-nightly-analysis] Stopped");
  }
}

/**
 * Run the full nightly analysis cycle.
 * Three sequential passes: Reels → Image Posts → Stories.
 *
 * Each pass:
 * 1. Runs analysis to find patterns in recent engagement data
 * 2. Updates the pipeline's Tactics file with evidence-backed changes
 * 3. Pipeline isolation: findings from one pipeline NEVER affect another
 */
export async function runNightlyAnalysis(
  config: PluginConfig
): Promise<{
  results: Array<{
    pipeline: Pipeline;
    postsAnalyzed: number;
    findingsCount: number;
    tacticsUpdated: boolean;
    newVersion?: number;
    error?: string;
  }>;
}> {
  console.log("[smi-nightly-analysis] Starting nightly analysis cycle...");

  const results: Array<{
    pipeline: Pipeline;
    postsAnalyzed: number;
    findingsCount: number;
    tacticsUpdated: boolean;
    newVersion?: number;
    error?: string;
  }> = [];

  for (const pipeline of PIPELINES) {
    // Skip disabled pipelines
    const pipelineConfig = config.pipelines[pipeline];
    if (!pipelineConfig.enabled) {
      console.log(`[smi-nightly-analysis] Skipping ${pipeline} (disabled)`);
      results.push({
        pipeline,
        postsAnalyzed: 0,
        findingsCount: 0,
        tacticsUpdated: false,
      });
      continue;
    }

    console.log(`[smi-nightly-analysis] Analyzing ${pipeline}...`);

    try {
      // Step 1: Run analysis
      const analysis = await runAnalysisTool({ pipeline, lookback_days: 30 });

      console.log(
        `[smi-nightly-analysis] ${pipeline}: ${analysis.posts_analyzed} posts analyzed, ${analysis.findings.length} findings, ${analysis.proposed_tactic_updates.length} proposed updates`
      );

      // Step 2: Apply proposed tactic updates (if any)
      let tacticsUpdated = false;
      let newVersion: number | undefined;

      if (analysis.proposed_tactic_updates.length > 0) {
        const updateResult = await updateTacticsTool({
          pipeline,
          updates: analysis.proposed_tactic_updates,
        });

        if (updateResult.success) {
          tacticsUpdated = true;
          newVersion = updateResult.new_version;
          console.log(
            `[smi-nightly-analysis] ${pipeline}: Tactics updated to v${newVersion} (${updateResult.changes_applied?.length} changes)`
          );
        } else {
          console.error(
            `[smi-nightly-analysis] ${pipeline}: Failed to update tactics: ${updateResult.error}`
          );
        }
      } else {
        console.log(
          `[smi-nightly-analysis] ${pipeline}: No statistically significant updates to apply`
        );
      }

      results.push({
        pipeline,
        postsAnalyzed: analysis.posts_analyzed,
        findingsCount: analysis.findings.length,
        tacticsUpdated,
        newVersion,
      });
    } catch (err: any) {
      console.error(`[smi-nightly-analysis] ${pipeline}: Error: ${err.message}`);
      logEvent({ type: "analysis_error", pipeline, summary: `Analysis error for ${pipeline}: ${err.message}` });
      results.push({
        pipeline,
        postsAnalyzed: 0,
        findingsCount: 0,
        tacticsUpdated: false,
        error: err.message,
      });
    }
  }

  console.log("[smi-nightly-analysis] Nightly analysis cycle complete");

  const totalFindings = results.reduce((s, r) => s + r.findingsCount, 0);
  const updatedPipelines = results.filter((r) => r.tacticsUpdated).map((r) => r.pipeline);
  logEvent({
    type: "analysis_complete",
    summary: `Nightly analysis done: ${totalFindings} findings across ${results.length} pipelines` +
      (updatedPipelines.length > 0 ? `, tactics updated for ${updatedPipelines.join(", ")}` : ""),
    details: results,
  });

  return { results };
}
