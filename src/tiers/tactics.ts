import { readJSON, writeJSON } from "../storage/files";
import { tacticsPath, Pipeline } from "../storage/paths";

export interface PostingTimes {
  best_slots: string[];
  timezone: string;
  confidence: number;
  evidence: string;
}

export interface VisualStyle {
  current_best: string;
  color_trends: string;
  hook_style: string;
  evidence_posts: string[];
}

export interface CaptionPatterns {
  optimal_length: { chars: number; confidence: number };
  cta_style: string;
  emoji_usage: string;
}

export interface HashtagStrategy {
  optimal_count: number;
  top_performing: string[];
  recently_tested: Array<{
    tag: string;
    posts_used: number;
    avg_reach_impact: string;
  }>;
}

export interface TacticsLearning {
  date: string;
  insight: string;
  evidence: string;
  applied_to: string;
}

export interface PillarPerformance {
  pillar: string;
  engagement_rate: number;
  comment_rate: number;
  avg_watch_time_ms: number;
  distribution_avg: number;
  hook_rate: number;
  post_count: number;
  trend: "rising" | "stable" | "declining";
}

export interface EngagementProfile {
  primary_strength: "retention" | "engagement" | "hooks" | "distribution";
  engagement_rate_avg: number;
  comment_rate_avg: number;
  avg_watch_time_ms: number;
  hook_rate_avg: number;
  distribution_avg: number;
  rewatch_ratio_avg: number;
}

export interface Tactics {
  pipeline: string;
  version: number;
  last_updated: string;
  posting_times: PostingTimes;
  visual_style: VisualStyle;
  caption_patterns: CaptionPatterns;
  hashtag_strategy: HashtagStrategy;
  content_pillar_performance: PillarPerformance[];
  account_engagement_profile: EngagementProfile;
  learnings: TacticsLearning[];
}

/**
 * Load tactics for a specific pipeline.
 */
export function loadTactics(pipeline: Pipeline): Tactics {
  const data = readJSON<Tactics>(tacticsPath(pipeline));
  if (!data) {
    throw new Error(
      `Tactics for "${pipeline}" not found. Run 'smi init' to set up the workspace.`
    );
  }
  return data;
}

/**
 * Update tactics for a pipeline with new findings.
 * Increments version, appends learnings, writes the file.
 */
export function updateTactics(
  pipeline: Pipeline,
  updates: Array<{
    field: string;
    new_value: any;
    evidence: string;
  }>
): { pipeline: string; new_version: number; changes_applied: string[] } {
  const tactics = loadTactics(pipeline);
  const changesApplied: string[] = [];

  for (const update of updates) {
    // Apply the update to the tactics object
    setNestedValue(tactics, update.field, update.new_value);
    changesApplied.push(update.field);

    // Append to learnings
    tactics.learnings.push({
      date: new Date().toISOString().split("T")[0],
      insight: `Updated ${update.field}`,
      evidence: update.evidence,
      applied_to: update.field,
    });
  }

  // Trim learnings to most recent 20
  if (tactics.learnings.length > 20) {
    tactics.learnings = tactics.learnings.slice(-20);
  }

  // Increment version
  tactics.version += 1;
  tactics.last_updated = new Date().toISOString();

  writeJSON(tacticsPath(pipeline), tactics);

  return {
    pipeline,
    new_version: tactics.version,
    changes_applied: changesApplied,
  };
}

/**
 * Get posting times for a pipeline.
 */
export function getPostingTimes(pipeline: Pipeline): PostingTimes {
  const tactics = loadTactics(pipeline);
  return tactics.posting_times;
}

// Helper: set a nested value on an object by dot-path
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const target = keys.reduce((o, key) => {
    if (!o[key]) o[key] = {};
    return o[key];
  }, obj);
  target[lastKey] = value;
}
