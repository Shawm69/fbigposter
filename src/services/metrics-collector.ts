import * as cron from "node-cron";
import { PluginConfig } from "../../config-schema";

/**
 * Metrics collector background service — DISABLED.
 *
 * Metrics collection now happens exclusively via the scrape pipeline:
 *   scrape_facebook_metrics (MCP browser tool) → smi_collect_metrics (scraped_posts param)
 *
 * The old Graph API collection path produced zeros for FB-native metrics
 * (distribution, watch_time_ms, etc.) and has been retired.
 *
 * If you need to re-enable automated collection in the future, integrate
 * with the scrape_facebook_metrics tool on a schedule instead.
 */

let collectorTask: cron.ScheduledTask | null = null;

/**
 * Start the metrics collector service.
 * Currently a no-op — metrics collection is scrape-only.
 */
export function startMetricsCollector(_config: PluginConfig): void {
  console.log(
    "[smi-metrics-collector] Disabled — metrics collection is now scrape-only. " +
    "Use scrape_facebook_metrics → smi_collect_metrics(scraped_posts) instead."
  );
}

/**
 * Stop the metrics collector service.
 */
export function stopMetricsCollector(): void {
  if (collectorTask) {
    collectorTask.stop();
    collectorTask = null;
    console.log("[smi-metrics-collector] Stopped");
  }
}
