import { graphAPIGet } from "./client";
import { PostHistoryEntry } from "../tools/post-content";

export type PostMetrics = PostHistoryEntry["metrics"];

export interface EngagementWeights {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
}

/**
 * A single post from the scrape_facebook_metrics MCP tool output.
 */
export interface ScrapedPost {
  title: string;
  date: string;
  views: number;
  viewers: number;
  engagement: number;
  comments: number;
  net_follows: number;
  impressions: number;
  distribution: number | null;
  watch_time_ms: number;
}

/**
 * Result of matching a scraped post to a history entry.
 */
export interface ScrapedMatch {
  scraped: ScrapedPost;
  historyEntry: PostHistoryEntry;
}

/**
 * Compute derived rate metrics from raw FB scrape values.
 */
function computeDerivedRates(scraped: ScrapedPost): {
  engagement_rate: number;
  comment_rate: number;
  hook_rate: number;
  rewatch_ratio: number;
  avg_watch_time_ms: number;
} {
  const v = scraped.viewers || 1;
  const imp = scraped.impressions || 1;
  return {
    engagement_rate: scraped.engagement / v,
    comment_rate: scraped.comments / v,
    hook_rate: scraped.viewers / imp,
    rewatch_ratio: scraped.views / v,
    avg_watch_time_ms: scraped.watch_time_ms / v,
  };
}

/**
 * Map a single scraped FB post to our PostHistoryEntry.metrics format.
 */
export function ingestScrapedMetrics(
  scraped: ScrapedPost,
  _historyEntry: PostHistoryEntry
): PostMetrics {
  const derived = computeDerivedRates(scraped);

  return {
    collected_at: new Date().toISOString(),
    // Raw from FB scrape
    views: scraped.views,
    viewers: scraped.viewers,
    engagement: scraped.engagement,
    comments: scraped.comments,
    net_follows: scraped.net_follows,
    impressions: scraped.impressions,
    distribution: scraped.distribution,
    watch_time_ms: scraped.watch_time_ms,
    // Derived
    engagement_rate: derived.engagement_rate,
    comment_rate: derived.comment_rate,
    hook_rate: derived.hook_rate,
    rewatch_ratio: derived.rewatch_ratio,
    avg_watch_time_ms: derived.avg_watch_time_ms,
    // Legacy backward compat
    reach: scraped.viewers,
    likes: 0,
    shares: 0,
    saves: 0,
    video_views: scraped.views,
    completion_rate: 0,
    profile_visits: 0,
    engagement_score: Math.round((scraped.engagement * 3 + scraped.viewers * 0.01) * 100) / 100,
    save_rate: 0,
    share_rate: 0,
  };
}

/**
 * Normalize caption text for fuzzy matching: lowercase, first 80 chars, strip whitespace.
 */
function normalizeCaption(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Match scraped posts to PostHistoryEntry records by caption text similarity.
 * Uses fuzzy match on first 80 chars of caption vs scraped title.
 */
export function matchScrapedToHistory(
  scrapedPosts: ScrapedPost[],
  history: PostHistoryEntry[]
): { matched: ScrapedMatch[]; unmatched: ScrapedPost[] } {
  const matched: ScrapedMatch[] = [];
  const unmatched: ScrapedPost[] = [];
  const usedHistoryIds = new Set<string>();

  for (const scraped of scrapedPosts) {
    const normalizedTitle = normalizeCaption(scraped.title);
    let bestMatch: PostHistoryEntry | null = null;
    let bestScore = 0;

    for (const entry of history) {
      if (usedHistoryIds.has(entry.id)) continue;
      const normalizedCaption = normalizeCaption(entry.caption);

      // Check if one contains the other or they share a significant prefix
      let score = 0;
      if (normalizedCaption === normalizedTitle) {
        score = 1.0;
      } else if (normalizedCaption.includes(normalizedTitle) || normalizedTitle.includes(normalizedCaption)) {
        score = 0.8;
      } else {
        // Character-level overlap: count matching prefix length
        let prefixLen = 0;
        const minLen = Math.min(normalizedCaption.length, normalizedTitle.length);
        for (let i = 0; i < minLen; i++) {
          if (normalizedCaption[i] === normalizedTitle[i]) prefixLen++;
          else break;
        }
        score = minLen > 0 ? prefixLen / minLen : 0;
      }

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      matched.push({ scraped, historyEntry: bestMatch });
      usedHistoryIds.add(bestMatch.id);
    } else {
      unmatched.push(scraped);
    }
  }

  return { matched, unmatched };
}

/**
 * Ensure rate metrics exist on a metrics object.
 * Backfills rates for old posts that predate rate computation.
 * Also backfills new FB-native derived metrics from available fields.
 */
export function ensureRates(metrics: PostMetrics): PostMetrics {
  const patched = { ...metrics };

  // Backfill engagement_rate from legacy fields if missing
  if (patched.engagement_rate === undefined || patched.engagement_rate === null) {
    const r = patched.viewers || patched.reach || 1;
    patched.engagement_rate = patched.engagement
      ? patched.engagement / r
      : (patched.likes + patched.comments + patched.shares + patched.saves) / r;
  }

  // Backfill comment_rate
  if (patched.comment_rate === undefined || patched.comment_rate === null) {
    const r = patched.viewers || patched.reach || 1;
    patched.comment_rate = patched.comments / r;
  }

  // Backfill hook_rate
  if ((patched.hook_rate === undefined || patched.hook_rate === null) && patched.impressions > 0) {
    patched.hook_rate = (patched.viewers || patched.reach || 0) / patched.impressions;
  }
  if (patched.hook_rate === undefined || patched.hook_rate === null) {
    patched.hook_rate = 0;
  }

  // Backfill rewatch_ratio
  if (patched.rewatch_ratio === undefined || patched.rewatch_ratio === null) {
    const v = patched.viewers || patched.reach || 1;
    patched.rewatch_ratio = (patched.views || patched.video_views || 0) / v;
  }

  // Backfill avg_watch_time_ms
  if (patched.avg_watch_time_ms === undefined || patched.avg_watch_time_ms === null) {
    const v = patched.viewers || patched.reach || 1;
    patched.avg_watch_time_ms = (patched.watch_time_ms || 0) / v;
  }

  // Backfill viewers from reach if missing
  if (!patched.viewers && patched.reach) {
    patched.viewers = patched.reach;
  }

  // Backfill views from video_views if missing
  if (!patched.views && patched.video_views) {
    patched.views = patched.video_views;
  }

  return patched;
}

/**
 * Fetch Instagram post insights (legacy Graph API path).
 */
export async function fetchInstagramMetrics(
  postId: string,
  weights: EngagementWeights
): Promise<PostMetrics> {
  const metricsToFetch = [
    "impressions",
    "reach",
    "likes",
    "comments",
    "shares",
    "saved",
    "video_views",
  ].join(",");

  const response = await graphAPIGet(`/${postId}/insights`, {
    metric: metricsToFetch,
  });

  const metricsMap: Record<string, number> = {};
  if (response.data) {
    for (const metric of response.data) {
      metricsMap[metric.name] = metric.values?.[0]?.value || 0;
    }
  }

  const basicFields = await graphAPIGet(`/${postId}`, {
    fields: "like_count,comments_count",
  });

  const likes = basicFields.like_count || metricsMap.likes || 0;
  const comments = basicFields.comments_count || metricsMap.comments || 0;
  const shares = metricsMap.shares || 0;
  const saves = metricsMap.saved || 0;
  const reach = metricsMap.reach || 0;
  const impressions = metricsMap.impressions || 0;
  const videoViews = metricsMap.video_views || 0;

  const engagementScore =
    likes * weights.likes +
    comments * weights.comments +
    shares * weights.shares +
    saves * weights.saves +
    reach * weights.reach;

  const commentRate = reach > 0 ? comments / reach : 0;
  const engagementRate = reach > 0 ? (likes + comments + shares + saves) / reach : 0;

  return {
    collected_at: new Date().toISOString(),
    views: videoViews,
    viewers: reach,
    engagement: likes + comments + shares,
    comments,
    net_follows: 0,
    impressions,
    distribution: null,
    watch_time_ms: 0,
    engagement_rate: engagementRate,
    comment_rate: commentRate,
    hook_rate: reach > 0 && impressions > 0 ? reach / impressions : 0,
    rewatch_ratio: reach > 0 && videoViews > 0 ? videoViews / reach : 0,
    avg_watch_time_ms: 0,
    reach,
    likes,
    shares,
    saves,
    video_views: videoViews,
    completion_rate: 0,
    profile_visits: 0,
    engagement_score: Math.round(engagementScore * 100) / 100,
    save_rate: 0,
    share_rate: 0,
  };
}

/**
 * Fetch Facebook post insights (legacy Graph API path).
 */
export async function fetchFacebookMetrics(
  postId: string,
  weights: EngagementWeights
): Promise<PostMetrics> {
  const metricsToFetch = [
    "post_impressions",
    "post_impressions_unique",
    "post_engaged_users",
    "post_clicks",
    "post_reactions_like_total",
  ].join(",");

  const response = await graphAPIGet(`/${postId}/insights`, {
    metric: metricsToFetch,
  });

  const metricsMap: Record<string, number> = {};
  if (response.data) {
    for (const metric of response.data) {
      metricsMap[metric.name] = metric.values?.[0]?.value || 0;
    }
  }

  const basicFields = await graphAPIGet(`/${postId}`, {
    fields: "reactions.summary(total_count),comments.summary(total_count),shares",
  });

  const likes = basicFields.reactions?.summary?.total_count || metricsMap.post_reactions_like_total || 0;
  const comments = basicFields.comments?.summary?.total_count || 0;
  const shares = basicFields.shares?.count || 0;
  const reach = metricsMap.post_impressions_unique || 0;
  const impressions = metricsMap.post_impressions || 0;

  const engagementScore =
    likes * weights.likes +
    comments * weights.comments +
    shares * weights.shares +
    reach * weights.reach;

  const saves = 0;
  const commentRate = reach > 0 ? comments / reach : 0;
  const engagementRate = reach > 0 ? (likes + comments + shares + saves) / reach : 0;

  return {
    collected_at: new Date().toISOString(),
    views: 0,
    viewers: reach,
    engagement: likes + comments + shares,
    comments,
    net_follows: 0,
    impressions,
    distribution: null,
    watch_time_ms: 0,
    engagement_rate: engagementRate,
    comment_rate: commentRate,
    hook_rate: reach > 0 && impressions > 0 ? reach / impressions : 0,
    rewatch_ratio: 0,
    avg_watch_time_ms: 0,
    reach,
    likes,
    shares,
    saves,
    video_views: 0,
    completion_rate: 0,
    profile_visits: 0,
    engagement_score: Math.round(engagementScore * 100) / 100,
    save_rate: 0,
    share_rate: 0,
  };
}

/**
 * Fetch metrics for a post, choosing the right platform API.
 */
export async function fetchPostMetrics(
  postId: string,
  platform: "instagram" | "facebook",
  weights: EngagementWeights
): Promise<PostMetrics> {
  if (platform === "instagram") {
    return fetchInstagramMetrics(postId, weights);
  }
  return fetchFacebookMetrics(postId, weights);
}
