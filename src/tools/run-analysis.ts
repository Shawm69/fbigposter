import { Pipeline } from "../storage/paths";
import { loadTactics } from "../tiers/tactics";
import { runCoreAnalysis, AnalysisResult, loadPipelinePosts } from "../analysis/analyzer";
import { runReelsAnalysis } from "../analysis/reels-analyzer";
import { runImagePostsAnalysis } from "../analysis/image-posts-analyzer";
import { runStoriesAnalysis } from "../analysis/stories-analyzer";

export interface RunAnalysisParams {
  pipeline: Pipeline;
  lookback_days?: number;
}

/**
 * Tool: smi_run_analysis
 *
 * Run analysis for a single pipeline. Called three times during nightly analysis.
 * Examines micro-details: hook styles, color palettes, caption lengths,
 * hashtag performance, posting times, prompt phrasing patterns, etc.
 */
export async function runAnalysisTool(
  params: RunAnalysisParams
): Promise<AnalysisResult> {
  const { pipeline, lookback_days = 30 } = params;

  if (!["reels", "image_posts", "stories"].includes(pipeline)) {
    throw new Error(`Invalid pipeline: "${pipeline}". Must be "reels", "image_posts", or "stories".`);
  }

  const tactics = loadTactics(pipeline);

  // Run core analysis (common across all pipelines)
  const result = runCoreAnalysis(pipeline, tactics, lookback_days);

  // Run pipeline-specific analysis
  const posts = loadPipelinePosts(pipeline, lookback_days);

  let pipelineFindings;
  switch (pipeline) {
    case "reels":
      pipelineFindings = runReelsAnalysis(posts);
      break;
    case "image_posts":
      pipelineFindings = runImagePostsAnalysis(posts);
      break;
    case "stories":
      pipelineFindings = runStoriesAnalysis(posts);
      break;
  }

  // Merge pipeline-specific findings
  if (pipelineFindings) {
    result.findings.push(...pipelineFindings);

    // Add significant pipeline-specific findings to proposed updates
    const newProposed = pipelineFindings
      .filter((f) => f.confidence >= 0.5 && f.suggested_field && f.suggested_value !== null)
      .map((f) => ({
        field: f.suggested_field,
        new_value: f.suggested_value,
        evidence: f.evidence,
      }));

    result.proposed_tactic_updates.push(...newProposed);
  }

  return result;
}
