import { PostHistoryEntry } from "../tools/post-content";
import { AnalysisFinding, getPrimaryMetric } from "./analyzer";
import { Pipeline } from "../storage/paths";
import { ensureRates } from "../meta-api/metrics";

/**
 * Analyze hook style performance by correlating tactics_snapshot.hook_style
 * with the pipeline's primary metric.
 */
export function analyzeHookStylePerformance(
  posts: PostHistoryEntry[],
  pipeline: Pipeline
): AnalysisFinding | null {
  if (pipeline === "stories") return null;

  const postsWithLog = posts.filter((p) => p.generation_log?.tactics_snapshot?.hook_style);
  if (postsWithLog.length < 5) return null;

  const primaryMetric = getPrimaryMetric(pipeline);

  const styleBuckets: Record<string, { totalMetric: number; count: number }> = {};

  for (const post of postsWithLog) {
    const hookStyle = post.generation_log!.tactics_snapshot.hook_style;
    const m = ensureRates(post.metrics);
    const value = (m as any)[primaryMetric] || 0;

    if (!styleBuckets[hookStyle]) styleBuckets[hookStyle] = { totalMetric: 0, count: 0 };
    styleBuckets[hookStyle].totalMetric += value;
    styleBuckets[hookStyle].count++;
  }

  const styles = Object.entries(styleBuckets)
    .filter(([, data]) => data.count >= 2)
    .map(([style, data]) => ({
      style,
      avgMetric: data.totalMetric / data.count,
      count: data.count,
    }))
    .sort((a, b) => b.avgMetric - a.avgMetric);

  if (styles.length === 0) return null;

  const best = styles[0];
  const worst = styles[styles.length - 1];

  const metricLabel = primaryMetric === "avg_watch_time_ms" ? "avg watch time" : "engagement rate";
  const bestValue = primaryMetric === "avg_watch_time_ms"
    ? `${(best.avgMetric / 1000).toFixed(1)}s`
    : `${(best.avgMetric * 100).toFixed(2)}%`;
  const worstValue = primaryMetric === "avg_watch_time_ms"
    ? `${(worst.avgMetric / 1000).toFixed(1)}s`
    : `${(worst.avgMetric * 100).toFixed(2)}%`;

  let insight = `Best hook style by ${metricLabel}: "${best.style}" (${bestValue}, ${best.count} posts)`;
  if (styles.length > 1 && best.style !== worst.style) {
    insight += `. Worst: "${worst.style}" (${worstValue}, ${worst.count} posts)`;
  }

  return {
    category: "hook_style_performance",
    insight,
    evidence: `Compared ${styles.length} hook styles across ${postsWithLog.length} posts with generation logs`,
    confidence: Math.min(0.8, postsWithLog.length / 20),
    suggested_field: "visual_style.hook_style",
    suggested_value: best.style,
  };
}

/**
 * Analyze media prompt patterns by finding discriminative keywords
 * in high-distribution vs low-distribution posts.
 */
export function analyzeMediaPromptPatterns(
  posts: PostHistoryEntry[]
): AnalysisFinding | null {
  const postsWithPrompt = posts.filter(
    (p) =>
      p.generation_log?.media_prompt &&
      p.metrics.distribution !== null &&
      p.metrics.distribution !== undefined
  );
  if (postsWithPrompt.length < 5) return null;

  const avgDist =
    postsWithPrompt.reduce((s, p) => s + (p.metrics.distribution || 0), 0) /
    postsWithPrompt.length;

  const highDist = postsWithPrompt.filter((p) => (p.metrics.distribution || 0) >= avgDist);
  const lowDist = postsWithPrompt.filter((p) => (p.metrics.distribution || 0) < avgDist);

  if (highDist.length === 0 || lowDist.length === 0) return null;

  // Extract word frequencies
  const getWordFreqs = (group: PostHistoryEntry[]): Record<string, number> => {
    const freqs: Record<string, number> = {};
    for (const post of group) {
      const words = post.generation_log!.media_prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const unique = new Set(words);
      for (const word of unique) {
        freqs[word] = (freqs[word] || 0) + 1;
      }
    }
    return freqs;
  };

  const highFreqs = getWordFreqs(highDist);
  const lowFreqs = getWordFreqs(lowDist);

  // Find discriminative keywords: appear in high-distribution but rarely in low
  const discriminative = Object.entries(highFreqs)
    .filter(([word, count]) => {
      const highRate = count / highDist.length;
      const lowRate = (lowFreqs[word] || 0) / lowDist.length;
      return highRate >= 0.3 && highRate > lowRate * 2 && count >= 2;
    })
    .map(([word, count]) => ({
      word,
      highRate: count / highDist.length,
      lowRate: (lowFreqs[word] || 0) / lowDist.length,
    }))
    .sort((a, b) => (b.highRate - b.lowRate) - (a.highRate - a.lowRate))
    .slice(0, 5);

  if (discriminative.length === 0) return null;

  const keywords = discriminative.map((d) => d.word);

  return {
    category: "media_prompt_patterns",
    insight: `High-distribution media prompts tend to include: ${keywords.join(", ")}`,
    evidence: `Compared word patterns in ${highDist.length} high-distribution vs ${lowDist.length} low-distribution posts (avg distribution: ${avgDist >= 0 ? "+" : ""}${avgDist.toFixed(2)}x)`,
    confidence: Math.min(0.7, postsWithPrompt.length / 25),
    suggested_field: "",
    suggested_value: null,
  };
}

/**
 * Analyze whether following pillar rotation recommendations helps performance.
 * Compares posts where content_pillar matches recommended_pillar_at_creation
 * vs posts where it doesn't.
 */
export function analyzePillarFollowThrough(
  posts: PostHistoryEntry[],
  pipeline: Pipeline
): AnalysisFinding | null {
  if (pipeline === "stories") return null;

  const postsWithLog = posts.filter(
    (p) => p.generation_log?.tactics_snapshot?.recommended_pillar_at_creation
  );
  if (postsWithLog.length < 5) return null;

  const primaryMetric = getPrimaryMetric(pipeline);

  let followedTotal = 0, followedCount = 0;
  let ignoredTotal = 0, ignoredCount = 0;

  for (const post of postsWithLog) {
    const recommended = post.generation_log!.tactics_snapshot.recommended_pillar_at_creation;
    const actual = post.content_pillar || "uncategorized";
    const m = ensureRates(post.metrics);
    const value = (m as any)[primaryMetric] || 0;

    if (actual === recommended) {
      followedTotal += value;
      followedCount++;
    } else {
      ignoredTotal += value;
      ignoredCount++;
    }
  }

  if (followedCount < 2 || ignoredCount < 2) return null;

  const followedAvg = followedTotal / followedCount;
  const ignoredAvg = ignoredTotal / ignoredCount;

  const metricLabel = primaryMetric === "avg_watch_time_ms" ? "avg watch time" : "engagement rate";
  const formatValue = (v: number) =>
    primaryMetric === "avg_watch_time_ms"
      ? `${(v / 1000).toFixed(1)}s`
      : `${(v * 100).toFixed(2)}%`;

  const betterWhen = followedAvg >= ignoredAvg ? "following" : "ignoring";
  const diff = Math.abs(followedAvg - ignoredAvg);
  const diffStr = formatValue(diff);

  return {
    category: "pillar_follow_through",
    insight: `Posts perform better when ${betterWhen} pillar rotation recommendations. Followed: ${formatValue(followedAvg)} ${metricLabel} (${followedCount} posts) vs ignored: ${formatValue(ignoredAvg)} (${ignoredCount} posts), difference: ${diffStr}`,
    evidence: `Analyzed ${postsWithLog.length} posts with generation logs comparing recommended vs actual pillar`,
    confidence: Math.min(0.75, postsWithLog.length / 20),
    suggested_field: "",
    suggested_value: null,
  };
}
