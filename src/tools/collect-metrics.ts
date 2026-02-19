import { readJSONL, updateJSONL } from "../storage/files";
import { postsHistoryPath } from "../storage/paths";
import { fetchPostMetrics, ScrapedPost, matchScrapedToHistory, ingestScrapedMetrics } from "../meta-api/metrics";
import { PostHistoryEntry } from "./post-content";
import { PluginConfig } from "../../config-schema";

export interface CollectMetricsParams {
  post_id?: string;
  pipeline?: string;
  since?: string;
  scraped_posts?: ScrapedPost[];
}

export interface CollectMetricsResult {
  success: boolean;
  posts_updated: number;
  matched?: number;
  unmatched?: number;
  summary: Array<{
    post_id: string;
    platform: string;
    engagement_rate: number;
  }>;
  error?: string;
}

/**
 * Tool: smi_collect_metrics
 *
 * Harvests engagement data for posts. Supports two modes:
 * 1. Scraped mode: accepts raw scraped FB data from scrape_facebook_metrics
 * 2. Graph API mode: fetches from Meta Graph API (legacy)
 */
export async function collectMetricsTool(
  params: CollectMetricsParams,
  config: PluginConfig
): Promise<CollectMetricsResult> {
  try {
    // Mode 1: Scraped data ingestion
    if (params.scraped_posts && params.scraped_posts.length > 0) {
      return ingestFromScrape(params.scraped_posts);
    }

    // Mode 2: Legacy Graph API collection
    return collectFromGraphAPI(params, config);
  } catch (err: any) {
    return {
      success: false,
      posts_updated: 0,
      summary: [],
      error: err.message,
    };
  }
}

/**
 * Ingest metrics from scraped FB data.
 */
function ingestFromScrape(scrapedPosts: ScrapedPost[]): CollectMetricsResult {
  const history = readJSONL<PostHistoryEntry>(postsHistoryPath());
  const { matched, unmatched } = matchScrapedToHistory(scrapedPosts, history);
  const summary: CollectMetricsResult["summary"] = [];

  for (const { scraped, historyEntry } of matched) {
    const metrics = ingestScrapedMetrics(scraped, historyEntry);

    updateJSONL<PostHistoryEntry>(
      postsHistoryPath(),
      (p) => p.id === historyEntry.id,
      (p) => ({
        ...p,
        metrics,
        metrics_harvests: (p.metrics_harvests || 0) + 1,
        metrics_complete: true,
      })
    );

    summary.push({
      post_id: historyEntry.id,
      platform: historyEntry.platform,
      engagement_rate: metrics.engagement_rate,
    });
  }

  return {
    success: true,
    posts_updated: matched.length,
    matched: matched.length,
    unmatched: unmatched.length,
    summary,
  };
}

/**
 * Legacy Graph API metrics collection.
 */
async function collectFromGraphAPI(
  params: CollectMetricsParams,
  config: PluginConfig
): Promise<CollectMetricsResult> {
  const posts = readJSONL<PostHistoryEntry>(postsHistoryPath());
  const summary: CollectMetricsResult["summary"] = [];

  let postsToProcess = posts.filter((p) => {
    if (p.metrics_complete) return false;
    if (params.post_id) return p.id === params.post_id;
    if (params.pipeline) {
      if (p.pipeline !== params.pipeline) return false;
    }
    if (params.since) {
      if (p.posted_at < params.since) return false;
    }
    return p.platform_post_id !== "";
  });

  let updated = 0;

  for (const post of postsToProcess) {
    try {
      const platform = post.platform as "instagram" | "facebook";
      const metrics = await fetchPostMetrics(
        post.platform_post_id,
        platform,
        config.metrics.engagement_weights
      );

      const harvests = (post.metrics_harvests || 0) + 1;
      const isComplete = harvests >= config.metrics.harvest_intervals.length;

      updateJSONL<PostHistoryEntry>(
        postsHistoryPath(),
        (p) => p.id === post.id,
        (p) => ({
          ...p,
          metrics,
          metrics_harvests: harvests,
          metrics_complete: isComplete,
        })
      );

      summary.push({
        post_id: post.id,
        platform: post.platform,
        engagement_rate: metrics.engagement_rate,
      });

      updated++;
    } catch (err: any) {
      summary.push({
        post_id: post.id,
        platform: post.platform,
        engagement_rate: -1,
      });
    }
  }

  return {
    success: true,
    posts_updated: updated,
    summary,
  };
}

/**
 * Get posts that are due for metrics collection based on harvest intervals.
 */
export function getPostsDueForCollection(
  config: PluginConfig
): PostHistoryEntry[] {
  const posts = readJSONL<PostHistoryEntry>(postsHistoryPath());
  const now = Date.now();

  return posts.filter((post) => {
    if (post.metrics_complete) return false;
    if (!post.platform_post_id) return false;

    const postedAt = new Date(post.posted_at).getTime();
    const harvests = post.metrics_harvests || 0;

    if (harvests >= config.metrics.harvest_intervals.length) return false;

    const nextInterval = config.metrics.harvest_intervals[harvests];
    const nextHarvestTime = postedAt + nextInterval * 60 * 1000;

    return now >= nextHarvestTime;
  });
}
