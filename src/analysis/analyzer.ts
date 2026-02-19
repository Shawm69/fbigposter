import { readJSONL } from "../storage/files";
import { postsHistoryPath, Pipeline } from "../storage/paths";
import { PostHistoryEntry } from "../tools/post-content";
import { Tactics, PillarPerformance, EngagementProfile } from "../tiers/tactics";
import { ensureRates } from "../meta-api/metrics";
import {
  analyzeHookStylePerformance,
  analyzeMediaPromptPatterns,
  analyzePillarFollowThrough,
} from "./generation-log-analyzer";

export interface AnalysisFinding {
  category: string;
  insight: string;
  evidence: string;
  confidence: number;
  suggested_field: string;
  suggested_value: any;
}

export interface AnalysisResult {
  pipeline: Pipeline;
  posts_analyzed: number;
  date_range: { from: string; to: string };
  findings: AnalysisFinding[];
  proposed_tactic_updates: Array<{
    field: string;
    new_value: any;
    evidence: string;
  }>;
}

/**
 * Load posts for a specific pipeline within a lookback window.
 * Uses viewers > 0 as the signal that metrics have been collected (scraped data
 * doesn't increment metrics_harvests the same way Graph API did).
 */
export function loadPipelinePosts(
  pipeline: Pipeline,
  lookbackDays: number = 30
): PostHistoryEntry[] {
  const allPosts = readJSONL<PostHistoryEntry>(postsHistoryPath());
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString();

  return allPosts.filter(
    (p) =>
      p.pipeline === pipeline &&
      p.posted_at >= cutoffStr &&
      ((p.metrics.viewers || 0) > 0 || p.metrics_harvests > 0)
  );
}

/**
 * Analyze posting time performance.
 * Uses viewers (unique reach) as the distribution signal.
 */
export function analyzePostingTimes(posts: PostHistoryEntry[]): AnalysisFinding | null {
  if (posts.length < 5) return null;

  const hourBuckets: Record<number, { totalViewers: number; count: number }> = {};

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    const hour = new Date(post.posted_at).getHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { totalViewers: 0, count: 0 };
    hourBuckets[hour].totalViewers += m.viewers || m.reach || 0;
    hourBuckets[hour].count++;
  }

  const significantHours = Object.entries(hourBuckets)
    .filter(([, data]) => data.count >= 2)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      avgViewers: data.totalViewers / data.count,
      count: data.count,
    }))
    .sort((a, b) => b.avgViewers - a.avgViewers);

  if (significantHours.length < 2) return null;

  const bestSlots = significantHours.slice(0, 2).map((h) => {
    const formatted = `${String(h.hour).padStart(2, "0")}:00`;
    return formatted;
  });

  const avgBest = significantHours[0].avgViewers;
  const avgWorst = significantHours[significantHours.length - 1].avgViewers;
  const improvement = avgWorst > 0 ? ((avgBest - avgWorst) / avgWorst * 100).toFixed(0) : "N/A";

  return {
    category: "posting_times",
    insight: `Best posting times identified: ${bestSlots.join(", ")}`,
    evidence: `Based on ${posts.length} posts; top slot averages ${avgBest.toFixed(0)} viewers vs ${avgWorst.toFixed(0)} for worst slot (${improvement}% difference)`,
    confidence: Math.min(0.9, posts.length / 50),
    suggested_field: "posting_times.best_slots",
    suggested_value: bestSlots,
  };
}

/**
 * Analyze caption length performance.
 * Uses engagement_rate (rate-based) for ranking.
 */
export function analyzeCaptionLength(posts: PostHistoryEntry[]): AnalysisFinding | null {
  if (posts.length < 5) return null;

  const ranges: Record<string, { totalRate: number; count: number; avgLen: number }> = {
    short: { totalRate: 0, count: 0, avgLen: 0 },
    medium: { totalRate: 0, count: 0, avgLen: 0 },
    long: { totalRate: 0, count: 0, avgLen: 0 },
  };

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    const len = post.caption.length;
    let bucket: string;
    if (len < 100) bucket = "short";
    else if (len < 250) bucket = "medium";
    else bucket = "long";

    ranges[bucket].totalRate += m.engagement_rate;
    ranges[bucket].count++;
    ranges[bucket].avgLen += len;
  }

  const significant = Object.entries(ranges)
    .filter(([, data]) => data.count >= 2)
    .map(([range, data]) => ({
      range,
      avgRate: data.totalRate / data.count,
      avgLen: Math.round(data.avgLen / data.count),
      count: data.count,
    }))
    .sort((a, b) => b.avgRate - a.avgRate);

  if (significant.length === 0) return null;

  const best = significant[0];

  return {
    category: "caption_length",
    insight: `${best.range} captions (~${best.avgLen} chars) perform best`,
    evidence: `Based on ${posts.length} posts; ${best.range} captions average ${(best.avgRate * 100).toFixed(2)}% engagement rate (${best.count} posts)`,
    confidence: Math.min(0.85, posts.length / 40),
    suggested_field: "caption_patterns.optimal_length",
    suggested_value: { chars: best.avgLen, confidence: Math.min(0.85, posts.length / 40) },
  };
}

/**
 * Analyze hashtag performance.
 * Optimal count ranked by viewers (distribution). Top tags by engagement rate.
 */
export function analyzeHashtags(posts: PostHistoryEntry[]): AnalysisFinding[] {
  if (posts.length < 5) return [];

  const findings: AnalysisFinding[] = [];

  const hashtagPerf: Record<string, { totalEngagementRate: number; count: number }> = {};
  const countBuckets: Record<number, { totalViewers: number; count: number }> = {};

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    const count = post.hashtags.length;
    if (!countBuckets[count]) countBuckets[count] = { totalViewers: 0, count: 0 };
    countBuckets[count].totalViewers += m.viewers || m.reach || 0;
    countBuckets[count].count++;

    for (const tag of post.hashtags) {
      const normalized = tag.toLowerCase();
      if (!hashtagPerf[normalized]) hashtagPerf[normalized] = { totalEngagementRate: 0, count: 0 };
      hashtagPerf[normalized].totalEngagementRate += m.engagement_rate;
      hashtagPerf[normalized].count++;
    }
  }

  // Find optimal hashtag count by viewers
  const countAnalysis = Object.entries(countBuckets)
    .filter(([, data]) => data.count >= 2)
    .map(([count, data]) => ({
      count: parseInt(count),
      avgViewers: data.totalViewers / data.count,
    }))
    .sort((a, b) => b.avgViewers - a.avgViewers);

  // Find top performing hashtags by engagement rate
  const topTags = Object.entries(hashtagPerf)
    .filter(([, data]) => data.count >= 2)
    .map(([tag, data]) => ({
      tag,
      avgEngagementRate: data.totalEngagementRate / data.count,
      count: data.count,
    }))
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
    .slice(0, 10)
    .map((t) => t.tag);

  if (countAnalysis.length === 0) return [];

  const optimalCount = countAnalysis[0].count;

  findings.push({
    category: "hashtags",
    insight: `Optimal hashtag count: ${optimalCount}. Top performers: ${topTags.slice(0, 5).join(", ")}`,
    evidence: `Based on ${posts.length} posts; ${optimalCount} hashtags average ${countAnalysis[0].avgViewers.toFixed(0)} viewers`,
    confidence: Math.min(0.8, posts.length / 50),
    suggested_field: "hashtag_strategy.optimal_count",
    suggested_value: optimalCount,
  });

  if (topTags.length > 0) {
    findings.push({
      category: "hashtags_top",
      insight: `Top performing hashtags by engagement rate: ${topTags.slice(0, 5).join(", ")}`,
      evidence: `Ranked by avg engagement rate across ${posts.length} posts`,
      confidence: Math.min(0.8, posts.length / 50),
      suggested_field: "hashtag_strategy.top_performing",
      suggested_value: topTags,
    });
  }

  return findings;
}

/**
 * Analyze engagement trends across tactics versions.
 */
export function analyzeVersionTrends(
  posts: PostHistoryEntry[],
  currentTactics: Tactics
): AnalysisFinding | null {
  if (posts.length < 10) return null;

  const versionBuckets: Record<number, { totalRate: number; count: number }> = {};

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    const v = post.tactics_version_used;
    if (!versionBuckets[v]) versionBuckets[v] = { totalRate: 0, count: 0 };
    versionBuckets[v].totalRate += m.engagement_rate;
    versionBuckets[v].count++;
  }

  const versions = Object.entries(versionBuckets)
    .map(([v, data]) => ({
      version: parseInt(v),
      avgRate: data.totalRate / data.count,
      count: data.count,
    }))
    .sort((a, b) => a.version - b.version);

  if (versions.length < 2) return null;

  const earliest = versions[0];
  const latest = versions[versions.length - 1];
  const trend = latest.avgRate - earliest.avgRate;
  const trendPct = earliest.avgRate > 0
    ? ((trend / earliest.avgRate) * 100).toFixed(1)
    : "N/A";

  return {
    category: "version_trends",
    insight: `Engagement ${trend > 0 ? "improved" : "declined"} by ${trendPct}% from tactics v${earliest.version} to v${latest.version}`,
    evidence: `v${earliest.version}: avg ${(earliest.avgRate * 100).toFixed(2)}% engagement (${earliest.count} posts) → v${latest.version}: avg ${(latest.avgRate * 100).toFixed(2)}% engagement (${latest.count} posts)`,
    confidence: Math.min(0.75, posts.length / 60),
    suggested_field: "",
    suggested_value: null,
  };
}

/**
 * Get the primary quality metric for a pipeline.
 * Reels optimize for avg_watch_time_ms (retention), image_posts for engagement_rate.
 */
export function getPrimaryMetric(pipeline: Pipeline): "avg_watch_time_ms" | "engagement_rate" {
  switch (pipeline) {
    case "reels": return "avg_watch_time_ms";
    case "image_posts": return "engagement_rate";
    case "stories": return "engagement_rate";
    default: return "engagement_rate";
  }
}

/**
 * Analyze content pillar performance.
 * Groups posts by content_pillar, computes FB-native metrics per pillar,
 * ranks by pipeline's primary metric, and detects trends.
 */
export function analyzeContentPillars(
  posts: PostHistoryEntry[],
  pipeline: Pipeline
): AnalysisFinding | null {
  if (posts.length < 10) return null;
  if (pipeline === "stories") return null;

  const primaryMetric = getPrimaryMetric(pipeline);

  const pillarGroups: Record<string, PostHistoryEntry[]> = {};
  for (const post of posts) {
    const pillar = post.content_pillar || "uncategorized";
    if (!pillarGroups[pillar]) pillarGroups[pillar] = [];
    pillarGroups[pillar].push(post);
  }

  const pillarPerformance: PillarPerformance[] = [];

  for (const [pillar, pillarPosts] of Object.entries(pillarGroups)) {
    if (pillarPosts.length < 3) continue;

    let totalEngagementRate = 0, totalCommentRate = 0, totalWatchTime = 0;
    let totalDistribution = 0, distributionCount = 0, totalHookRate = 0;

    for (const post of pillarPosts) {
      const m = ensureRates(post.metrics);
      totalEngagementRate += m.engagement_rate;
      totalCommentRate += m.comment_rate;
      totalWatchTime += m.avg_watch_time_ms;
      totalHookRate += m.hook_rate;
      if (m.distribution !== null && m.distribution !== undefined) {
        totalDistribution += m.distribution;
        distributionCount++;
      }
    }
    const count = pillarPosts.length;

    // Detect trend: split into halves by posted_at order
    const sorted = [...pillarPosts].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const getAvgMetric = (arr: PostHistoryEntry[], metric: string): number => {
      if (arr.length === 0) return 0;
      return arr.reduce((sum, p) => {
        const m = ensureRates(p.metrics);
        return sum + (m as any)[metric];
      }, 0) / arr.length;
    };

    const firstAvg = getAvgMetric(firstHalf, primaryMetric);
    const secondAvg = getAvgMetric(secondHalf, primaryMetric);

    let trend: "rising" | "stable" | "declining" = "stable";
    if (firstAvg > 0) {
      const change = (secondAvg - firstAvg) / firstAvg;
      if (change >= 0.2) trend = "rising";
      else if (change <= -0.2) trend = "declining";
    }

    pillarPerformance.push({
      pillar,
      engagement_rate: totalEngagementRate / count,
      comment_rate: totalCommentRate / count,
      avg_watch_time_ms: totalWatchTime / count,
      distribution_avg: distributionCount > 0 ? totalDistribution / distributionCount : 0,
      hook_rate: totalHookRate / count,
      post_count: count,
      trend,
    });
  }

  if (pillarPerformance.length === 0) return null;

  // Rank by primary metric
  pillarPerformance.sort((a, b) => (b as any)[primaryMetric] - (a as any)[primaryMetric]);

  const topPillar = pillarPerformance[0];
  const decliningPillars = pillarPerformance.filter((p) => p.trend === "declining");

  const metricValue = primaryMetric === "avg_watch_time_ms"
    ? `${((topPillar as any)[primaryMetric] / 1000).toFixed(1)}s`
    : `${((topPillar as any)[primaryMetric] * 100).toFixed(1)}%`;

  let insight = `Top content pillar by ${primaryMetric}: "${topPillar.pillar}" (${metricValue})`;
  if (decliningPillars.length > 0) {
    insight += `. Declining: ${decliningPillars.map((p) => `"${p.pillar}"`).join(", ")}`;
  }

  return {
    category: "content_pillars",
    insight,
    evidence: `Analyzed ${posts.length} posts across ${pillarPerformance.length} pillars, ranked by ${primaryMetric}`,
    confidence: Math.min(0.85, posts.length / 40),
    suggested_field: "content_pillar_performance",
    suggested_value: pillarPerformance,
  };
}

/**
 * Analyze account-wide engagement profile.
 * Determines primary strength from FB-native metrics.
 */
export function analyzeEngagementProfile(posts: PostHistoryEntry[]): AnalysisFinding | null {
  if (posts.length < 10) return null;

  let totalEngagementRate = 0, totalCommentRate = 0, totalHookRate = 0;
  let totalWatchTime = 0, totalRewatchRatio = 0;
  let totalDistribution = 0, distributionCount = 0;

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    totalEngagementRate += m.engagement_rate;
    totalCommentRate += m.comment_rate;
    totalHookRate += m.hook_rate;
    totalWatchTime += m.avg_watch_time_ms;
    totalRewatchRatio += m.rewatch_ratio;
    if (m.distribution !== null && m.distribution !== undefined) {
      totalDistribution += m.distribution;
      distributionCount++;
    }
  }

  const count = posts.length;
  const engagementRateAvg = totalEngagementRate / count;
  const commentRateAvg = totalCommentRate / count;
  const hookRateAvg = totalHookRate / count;
  const avgWatchTimeMs = totalWatchTime / count;
  const rewatchRatioAvg = totalRewatchRatio / count;
  const distributionAvg = distributionCount > 0 ? totalDistribution / distributionCount : 0;

  // Determine primary_strength
  let primaryStrength: EngagementProfile["primary_strength"] = "engagement";
  if (avgWatchTimeMs > 5000) primaryStrength = "retention";
  else if (hookRateAvg > 0.9) primaryStrength = "hooks";
  else if (distributionAvg > 0) primaryStrength = "distribution";

  const profile: EngagementProfile = {
    primary_strength: primaryStrength,
    engagement_rate_avg: engagementRateAvg,
    comment_rate_avg: commentRateAvg,
    avg_watch_time_ms: avgWatchTimeMs,
    hook_rate_avg: hookRateAvg,
    distribution_avg: distributionAvg,
    rewatch_ratio_avg: rewatchRatioAvg,
  };

  const strengthDescriptions: Record<string, string> = {
    retention: "viewers watch your content longer than average",
    engagement: "your content drives reactions and interactions",
    hooks: "your first frames stop the scroll effectively",
    distribution: "the algorithm favors your content for distribution",
  };

  return {
    category: "engagement_profile",
    insight: `Primary strength: ${profile.primary_strength} (${strengthDescriptions[profile.primary_strength]}). Avg: ${(engagementRateAvg * 100).toFixed(1)}% engagement, ${(avgWatchTimeMs / 1000).toFixed(1)}s watch time, ${hookRateAvg.toFixed(2)} hook rate`,
    evidence: `Computed from ${count} posts with viewer data`,
    confidence: Math.min(0.85, posts.length / 40),
    suggested_field: "account_engagement_profile",
    suggested_value: profile,
  };
}

/**
 * Analyze distribution score correlations.
 * Uniquely powerful — FB is literally telling us what it liked.
 */
export function analyzeDistribution(posts: PostHistoryEntry[]): AnalysisFinding | null {
  const postsWithDist = posts.filter(
    (p) => p.metrics.distribution !== null && p.metrics.distribution !== undefined
  );
  if (postsWithDist.length < 5) return null;

  // Correlate distribution with posting time
  const hourBuckets: Record<number, { totalDist: number; count: number }> = {};
  // Correlate distribution with watch time
  let highDistWatchTime = 0, highDistCount = 0;
  let lowDistWatchTime = 0, lowDistCount = 0;

  const avgDist = postsWithDist.reduce((s, p) => s + (p.metrics.distribution || 0), 0) / postsWithDist.length;

  for (const post of postsWithDist) {
    const m = ensureRates(post.metrics);
    const hour = new Date(post.posted_at).getHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { totalDist: 0, count: 0 };
    hourBuckets[hour].totalDist += m.distribution || 0;
    hourBuckets[hour].count++;

    if ((m.distribution || 0) >= avgDist) {
      highDistWatchTime += m.avg_watch_time_ms;
      highDistCount++;
    } else {
      lowDistWatchTime += m.avg_watch_time_ms;
      lowDistCount++;
    }
  }

  // Find best distribution hours
  const hourAnalysis = Object.entries(hourBuckets)
    .filter(([, data]) => data.count >= 2)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      avgDist: data.totalDist / data.count,
    }))
    .sort((a, b) => b.avgDist - a.avgDist);

  const bestHour = hourAnalysis.length > 0 ? hourAnalysis[0] : null;
  const highAvgWatch = highDistCount > 0 ? highDistWatchTime / highDistCount : 0;
  const lowAvgWatch = lowDistCount > 0 ? lowDistWatchTime / lowDistCount : 0;

  const insights: string[] = [];
  insights.push(`Avg distribution score: ${avgDist >= 0 ? "+" : ""}${avgDist.toFixed(2)}x`);
  if (bestHour) {
    insights.push(`best distribution hour: ${String(bestHour.hour).padStart(2, "0")}:00 (${bestHour.avgDist >= 0 ? "+" : ""}${bestHour.avgDist.toFixed(2)}x)`);
  }
  if (highAvgWatch > lowAvgWatch && lowAvgWatch > 0) {
    const watchDiff = ((highAvgWatch - lowAvgWatch) / lowAvgWatch * 100).toFixed(0);
    insights.push(`high-distribution posts have ${watchDiff}% longer watch time`);
  }

  return {
    category: "distribution",
    insight: insights.join("; "),
    evidence: `Analyzed distribution scores from ${postsWithDist.length} posts`,
    confidence: Math.min(0.8, postsWithDist.length / 20),
    suggested_field: "",
    suggested_value: null,
  };
}

/**
 * Analyze hook quality for reels with impressions > 0.
 * Identifies posts with high impressions but low hook_rate (content the algorithm
 * tried to push but viewers didn't stop for).
 */
export function analyzeHookQuality(posts: PostHistoryEntry[]): AnalysisFinding | null {
  const postsWithImpressions = posts.filter(
    (p) => p.metrics.impressions > 0 && (p.metrics.viewers || p.metrics.reach) > 0
  );
  if (postsWithImpressions.length < 5) return null;

  const hookRates = postsWithImpressions.map((p) => {
    const m = ensureRates(p.metrics);
    return {
      hookRate: m.hook_rate,
      viewers: m.viewers || m.reach || 0,
      impressions: m.impressions,
      caption: p.caption,
    };
  });

  const avgHookRate = hookRates.reduce((s, h) => s + h.hookRate, 0) / hookRates.length;

  // Find missed opportunities: high impressions but low hook rate
  const missedOpps = hookRates
    .filter((h) => h.hookRate < avgHookRate && h.impressions > hookRates.reduce((s, hr) => s + hr.impressions, 0) / hookRates.length)
    .length;

  const highHook = hookRates.filter((h) => h.hookRate >= avgHookRate);
  const lowHook = hookRates.filter((h) => h.hookRate < avgHookRate);

  const highAvgCaptionLen = highHook.length > 0
    ? highHook.reduce((s, h) => s + h.caption.length, 0) / highHook.length
    : 0;
  const lowAvgCaptionLen = lowHook.length > 0
    ? lowHook.reduce((s, h) => s + h.caption.length, 0) / lowHook.length
    : 0;

  return {
    category: "hook_quality",
    insight: `Avg hook rate: ${(avgHookRate * 100).toFixed(1)}%. ${missedOpps} post(s) had high reach but low hooks. High-hook posts have ${highAvgCaptionLen < lowAvgCaptionLen ? "shorter" : "longer"} captions (~${Math.round(highAvgCaptionLen)} chars)`,
    evidence: `Analyzed ${postsWithImpressions.length} posts with impression data`,
    confidence: Math.min(0.75, postsWithImpressions.length / 20),
    suggested_field: "",
    suggested_value: null,
  };
}

/**
 * Run full analysis for a pipeline.
 */
export function runCoreAnalysis(
  pipeline: Pipeline,
  tactics: Tactics,
  lookbackDays: number = 30
): AnalysisResult {
  const posts = loadPipelinePosts(pipeline, lookbackDays);

  const findings: AnalysisFinding[] = [];

  const timeFinding = analyzePostingTimes(posts);
  if (timeFinding) findings.push(timeFinding);

  const captionFinding = analyzeCaptionLength(posts);
  if (captionFinding) findings.push(captionFinding);

  const hashtagFindings = analyzeHashtags(posts);
  findings.push(...hashtagFindings);

  const trendFinding = analyzeVersionTrends(posts, tactics);
  if (trendFinding) findings.push(trendFinding);

  const pillarFinding = analyzeContentPillars(posts, pipeline);
  if (pillarFinding) findings.push(pillarFinding);

  const profileFinding = analyzeEngagementProfile(posts);
  if (profileFinding) findings.push(profileFinding);

  const distributionFinding = analyzeDistribution(posts);
  if (distributionFinding) findings.push(distributionFinding);

  const hookFinding = analyzeHookQuality(posts);
  if (hookFinding) findings.push(hookFinding);

  const hookStyleFinding = analyzeHookStylePerformance(posts, pipeline);
  if (hookStyleFinding) findings.push(hookStyleFinding);

  const mediaPromptFinding = analyzeMediaPromptPatterns(posts);
  if (mediaPromptFinding) findings.push(mediaPromptFinding);

  const pillarFollowFinding = analyzePillarFollowThrough(posts, pipeline);
  if (pillarFollowFinding) findings.push(pillarFollowFinding);

  // Convert significant findings into proposed tactic updates
  const proposed = findings
    .filter((f) => f.confidence >= 0.5 && f.suggested_field && f.suggested_value !== null)
    .map((f) => ({
      field: f.suggested_field,
      new_value: f.suggested_value,
      evidence: f.evidence,
    }));

  const dateRange = posts.length > 0
    ? {
        from: posts[0].posted_at,
        to: posts[posts.length - 1].posted_at,
      }
    : { from: "", to: "" };

  return {
    pipeline,
    posts_analyzed: posts.length,
    date_range: dateRange,
    findings,
    proposed_tactic_updates: proposed,
  };
}
