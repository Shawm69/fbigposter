import { PostHistoryEntry } from "../tools/post-content";
import { AnalysisFinding } from "./analyzer";

/**
 * Stories-specific analysis: impression patterns.
 * PAUSED: FB story metrics are all zeros after 24h expiry.
 * No reliable data available from scraping.
 */
export function analyzeStoryImpressions(_posts: PostHistoryEntry[]): AnalysisFinding | null {
  // Story metrics from FB scraping are unreliable — all zeros after expiry
  return null;
}

/**
 * Stories-specific analysis: retention patterns.
 * PAUSED: FB story metrics are all zeros after 24h expiry.
 * No reliable data available from scraping.
 */
export function analyzeStoryRetention(_posts: PostHistoryEntry[]): AnalysisFinding | null {
  // Story metrics from FB scraping are unreliable — all zeros after expiry
  return null;
}

/**
 * Run all Stories-specific analyses.
 * Currently returns empty — story analysis is paused until we have a reliable data source.
 */
export function runStoriesAnalysis(_posts: PostHistoryEntry[]): AnalysisFinding[] {
  return [];
}
