import { PostHistoryEntry } from "../tools/post-content";
import { AnalysisFinding } from "./analyzer";
import { ensureRates } from "../meta-api/metrics";

/**
 * Reels-specific analysis: video retention via avg_watch_time_ms.
 * Replaces the old completion_rate analysis — we can't get completion rate
 * from FB scraping, but avg_watch_time_ms is a direct proxy.
 */
export function analyzeReelRetention(posts: PostHistoryEntry[]): AnalysisFinding | null {
  const reelPosts = posts.filter((p) => {
    const m = ensureRates(p.metrics);
    return m.avg_watch_time_ms > 0;
  });
  if (reelPosts.length < 3) return null;

  const avgWatchTime =
    reelPosts.reduce((sum, p) => sum + ensureRates(p.metrics).avg_watch_time_ms, 0) / reelPosts.length;

  // Correlate retention with engagement
  const highRetention = reelPosts.filter((p) => ensureRates(p.metrics).avg_watch_time_ms > avgWatchTime);
  const lowRetention = reelPosts.filter((p) => ensureRates(p.metrics).avg_watch_time_ms <= avgWatchTime);

  const highAvgEngagement =
    highRetention.length > 0
      ? highRetention.reduce((sum, p) => sum + ensureRates(p.metrics).engagement_rate, 0) / highRetention.length
      : 0;
  const lowAvgEngagement =
    lowRetention.length > 0
      ? lowRetention.reduce((sum, p) => sum + ensureRates(p.metrics).engagement_rate, 0) / lowRetention.length
      : 0;

  if (highAvgEngagement <= lowAvgEngagement) return null;

  const improvement = lowAvgEngagement > 0
    ? ((highAvgEngagement - lowAvgEngagement) / lowAvgEngagement * 100).toFixed(0)
    : "N/A";

  return {
    category: "reel_retention",
    insight: `Reels with higher watch time get ${improvement}% more engagement`,
    evidence: `Analyzed ${reelPosts.length} reels; high-retention (>${(avgWatchTime / 1000).toFixed(1)}s avg) have ${(highAvgEngagement * 100).toFixed(2)}% engagement vs ${(lowAvgEngagement * 100).toFixed(2)}% for lower retention`,
    confidence: Math.min(0.8, reelPosts.length / 20),
    suggested_field: "visual_style.current_best",
    suggested_value: `Focus on retention — ${avgWatchTime > 6000 ? "strong narrative arc with payoff" : "faster pacing and quicker hooks"}`,
  };
}

/**
 * Reels-specific analysis: engagement pattern via comment_rate and engagement_rate.
 * Determines whether audience engages via comments vs reactions.
 */
export function analyzeReelViewPatterns(posts: PostHistoryEntry[]): AnalysisFinding | null {
  const reelPosts = posts.filter((p) => {
    const m = ensureRates(p.metrics);
    return (m.viewers || m.reach || 0) > 0;
  });
  if (reelPosts.length < 5) return null;

  let totalCommentRate = 0, totalEngagementRate = 0;

  for (const post of reelPosts) {
    const m = ensureRates(post.metrics);
    totalCommentRate += m.comment_rate;
    totalEngagementRate += m.engagement_rate;
  }

  const avgCommentRate = totalCommentRate / reelPosts.length;
  const avgEngagementRate = totalEngagementRate / reelPosts.length;
  const avgNonCommentRate = avgEngagementRate - avgCommentRate;

  // Determine strongest interaction type
  const strongest = avgCommentRate > avgNonCommentRate
    ? { type: "comments", rate: avgCommentRate }
    : { type: "reactions", rate: avgNonCommentRate };

  return {
    category: "reel_view_patterns",
    insight: `Reels drive ${strongest.type} most effectively (${(strongest.rate * 100).toFixed(2)}% rate)`,
    evidence: `Analyzed ${reelPosts.length} reels; avg comment rate: ${(avgCommentRate * 100).toFixed(2)}%, avg engagement rate: ${(avgEngagementRate * 100).toFixed(2)}%`,
    confidence: Math.min(0.7, reelPosts.length / 30),
    suggested_field: "caption_patterns.cta_style",
    suggested_value: strongest.type === "comments"
      ? "question-based CTAs to maintain comment momentum"
      : "engagement-driving CTAs — relatable, emotional, shareable content",
  };
}

/**
 * Run all Reels-specific analyses.
 */
export function runReelsAnalysis(posts: PostHistoryEntry[]): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  const retentionFinding = analyzeReelRetention(posts);
  if (retentionFinding) findings.push(retentionFinding);

  const viewFinding = analyzeReelViewPatterns(posts);
  if (viewFinding) findings.push(viewFinding);

  return findings;
}
