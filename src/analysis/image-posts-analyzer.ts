import { PostHistoryEntry } from "../tools/post-content";
import { AnalysisFinding } from "./analyzer";
import { ensureRates } from "../meta-api/metrics";

/**
 * Image post-specific analysis: engagement rate patterns.
 * Replaces the old save_rate analysis — we can't get individual saves
 * from FB scraping, so we use engagement_rate as the quality signal.
 */
export function analyzeImageEngagement(posts: PostHistoryEntry[]): AnalysisFinding | null {
  if (posts.length < 5) return null;

  const postsWithViewers = posts.filter((p) => {
    const m = ensureRates(p.metrics);
    return (m.viewers || m.reach || 0) > 0;
  });
  if (postsWithViewers.length < 3) return null;

  const engagementRates = postsWithViewers.map((p) => {
    const m = ensureRates(p.metrics);
    return {
      engagementRate: m.engagement_rate,
      captionLen: p.caption.length,
      hashtagCount: p.hashtags.length,
      pillar: p.content_pillar || "uncategorized",
    };
  });

  const avgEngRate = engagementRates.reduce((s, r) => s + r.engagementRate, 0) / engagementRates.length;

  // Correlate engagement rate with caption characteristics
  const highEng = engagementRates.filter((r) => r.engagementRate > avgEngRate);
  const lowEng = engagementRates.filter((r) => r.engagementRate <= avgEngRate);

  if (highEng.length === 0 || lowEng.length === 0) return null;

  const highAvgCaptionLen = highEng.reduce((s, r) => s + r.captionLen, 0) / highEng.length;
  const lowAvgCaptionLen = lowEng.reduce((s, r) => s + r.captionLen, 0) / lowEng.length;

  const captionLenDiff = highAvgCaptionLen > lowAvgCaptionLen ? "longer" : "shorter";

  // Find which content pillar has the highest engagement rate
  const pillarRates: Record<string, { total: number; count: number }> = {};
  for (const r of engagementRates) {
    if (!pillarRates[r.pillar]) pillarRates[r.pillar] = { total: 0, count: 0 };
    pillarRates[r.pillar].total += r.engagementRate;
    pillarRates[r.pillar].count++;
  }
  const topEngPillar = Object.entries(pillarRates)
    .filter(([, d]) => d.count >= 2)
    .map(([pillar, d]) => ({ pillar, avg: d.total / d.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  const pillarNote = topEngPillar
    ? `. Top engagement pillar: "${topEngPillar.pillar}" (${(topEngPillar.avg * 100).toFixed(1)}%)`
    : "";

  return {
    category: "image_engagement",
    insight: `High-engagement image posts tend to have ${captionLenDiff} captions (~${Math.round(highAvgCaptionLen)} chars)${pillarNote}`,
    evidence: `Analyzed ${postsWithViewers.length} posts; high-engagement posts avg ${Math.round(highAvgCaptionLen)} char captions vs ${Math.round(lowAvgCaptionLen)} for low-engagement. Avg engagement rate: ${(avgEngRate * 100).toFixed(2)}%`,
    confidence: Math.min(0.75, postsWithViewers.length / 30),
    suggested_field: "caption_patterns.optimal_length",
    suggested_value: {
      chars: Math.round(highAvgCaptionLen),
      confidence: Math.min(0.75, postsWithViewers.length / 30),
    },
  };
}

/**
 * Image post-specific analysis: engagement by hashtag count.
 * Uses viewers for reach impact (same as before, but field name updated).
 */
export function analyzeImageHashtagImpact(posts: PostHistoryEntry[]): AnalysisFinding | null {
  if (posts.length < 5) return null;

  const ranges: Record<string, { totalViewers: number; totalEngagement: number; count: number }> = {
    "1-5": { totalViewers: 0, totalEngagement: 0, count: 0 },
    "6-10": { totalViewers: 0, totalEngagement: 0, count: 0 },
    "11-15": { totalViewers: 0, totalEngagement: 0, count: 0 },
    "16+": { totalViewers: 0, totalEngagement: 0, count: 0 },
  };

  for (const post of posts) {
    const m = ensureRates(post.metrics);
    const count = post.hashtags.length;
    let bucket: string;
    if (count <= 5) bucket = "1-5";
    else if (count <= 10) bucket = "6-10";
    else if (count <= 15) bucket = "11-15";
    else bucket = "16+";

    ranges[bucket].totalViewers += m.viewers || m.reach || 0;
    ranges[bucket].totalEngagement += m.engagement_rate;
    ranges[bucket].count++;
  }

  const significant = Object.entries(ranges)
    .filter(([, data]) => data.count >= 2)
    .map(([range, data]) => ({
      range,
      avgViewers: data.totalViewers / data.count,
      avgEngagement: data.totalEngagement / data.count,
      count: data.count,
    }))
    .sort((a, b) => b.avgViewers - a.avgViewers);

  if (significant.length === 0) return null;

  const bestRange = significant[0];

  return {
    category: "image_hashtag_impact",
    insight: `Image posts with ${bestRange.range} hashtags get the best reach`,
    evidence: `${bestRange.range} hashtags: avg viewers ${bestRange.avgViewers.toFixed(0)} (${bestRange.count} posts). Avg engagement rate: ${(bestRange.avgEngagement * 100).toFixed(2)}%`,
    confidence: Math.min(0.7, posts.length / 30),
    suggested_field: "hashtag_strategy.optimal_count",
    suggested_value: bestRange.range === "1-5" ? 5 : bestRange.range === "6-10" ? 8 : bestRange.range === "11-15" ? 12 : 15,
  };
}

/**
 * Run all image post-specific analyses.
 */
export function runImagePostsAnalysis(posts: PostHistoryEntry[]): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  const engagementFinding = analyzeImageEngagement(posts);
  if (engagementFinding) findings.push(engagementFinding);

  const hashtagFinding = analyzeImageHashtagImpact(posts);
  if (hashtagFinding) findings.push(hashtagFinding);

  return findings;
}
