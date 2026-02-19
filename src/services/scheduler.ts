import * as cron from "node-cron";
import { readJSON, writeJSON } from "../storage/files";
import { schedulePath, Pipeline } from "../storage/paths";
import { postContentTool } from "../tools/post-content";
import { loadConstitution, checkDailyLimit } from "../tiers/constitution";
import { readJSONL } from "../storage/files";
import { postsHistoryPath } from "../storage/paths";
import { PostHistoryEntry } from "../tools/post-content";
import { PluginConfig } from "../../config-schema";
import { logEvent } from "./event-log";

export interface ScheduleEntry {
  id: string;
  pipeline: Pipeline;
  media_path: string;
  caption: string;
  hashtags: string[];
  post_type: "feed" | "reel" | "story";
  posting_time: string; // HH:MM
  status: "pending" | "posted" | "failed";
  error?: string;
}

export interface DailySchedule {
  date: string;
  items: ScheduleEntry[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let schedulerTask: cron.ScheduledTask | null = null;

/**
 * Start the scheduler service.
 * Runs every 15 minutes during posting windows to check for content due to be posted.
 */
export function startScheduler(config: PluginConfig): void {
  if (schedulerTask) {
    schedulerTask.stop();
  }

  // Run every 15 minutes
  schedulerTask = cron.schedule("*/15 * * * *", async () => {
    await runSchedulerTick(config);
  }, {
    timezone: config.schedule.timezone,
  });

  console.log("[smi-scheduler] Started — checking every 15 minutes");
}

/**
 * Stop the scheduler service.
 */
export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("[smi-scheduler] Stopped");
  }
}

/**
 * Get the current time in a specific timezone using Intl.DateTimeFormat.
 */
export function getCurrentTimeInZone(tz: string): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  return {
    hour: parseInt(parts.find((p) => p.type === "hour")!.value),
    minute: parseInt(parts.find((p) => p.type === "minute")!.value),
  };
}

/**
 * Get the current date string (YYYY-MM-DD) in a specific timezone.
 */
function getDateStrInZone(tz: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Run a single scheduler tick: check for content due and post it.
 */
export async function runSchedulerTick(config: PluginConfig): Promise<void> {
  const tz = config.schedule.timezone;
  const { hour: currentHour, minute: currentMinute } = getCurrentTimeInZone(tz);
  const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

  // Check if within posting window
  const { start, end } = config.schedule.posting_windows;
  if (currentTime < start || currentTime > end) {
    return; // Outside posting window
  }

  const dateStr = getDateStrInZone(tz);
  const schedule = readJSON<DailySchedule>(schedulePath(dateStr));
  if (!schedule) return;

  // Find items due for posting
  const dueItems = schedule.items.filter((item) => {
    if (item.status !== "pending") return false;

    // Check if the posting time has passed (within 15-min window)
    const [itemHour, itemMinute] = item.posting_time.split(":").map(Number);
    const itemTimeMinutes = itemHour * 60 + itemMinute;
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    return currentTimeMinutes >= itemTimeMinutes && currentTimeMinutes < itemTimeMinutes + 15;
  });

  if (dueItems.length === 0) return;

  // Check daily limits
  const constitution = loadConstitution();
  const history = readJSONL<PostHistoryEntry>(postsHistoryPath());
  const todayPosts = history.filter((p) => p.posted_at.startsWith(dateStr));

  for (const item of dueItems) {
    const pipelinePosts = todayPosts.filter((p) => p.pipeline === item.pipeline);
    if (!checkDailyLimit(constitution, item.pipeline, pipelinePosts.length)) {
      item.status = "failed";
      item.error = `Daily limit reached for ${item.pipeline}`;
      continue;
    }

    try {
      const result = await postContentTool(
        {
          pipeline: item.pipeline,
          media_path: item.media_path,
          caption: item.caption,
          hashtags: item.hashtags,
          post_type: item.post_type,
        },
        config
      );

      if (result.success) {
        item.status = "posted";
        console.log(`[smi-scheduler] Posted ${item.pipeline} content: ${item.id}`);
        logEvent({ type: "post_published", pipeline: item.pipeline, summary: `Posted ${item.pipeline} content (${item.id})` });
      } else {
        item.status = "failed";
        item.error = result.error || "Unknown error";
        console.error(`[smi-scheduler] Failed to post ${item.id}: ${item.error}`);
        logEvent({ type: "post_failed", pipeline: item.pipeline, summary: `Failed to post ${item.pipeline}: ${item.error}` });
      }

      // Rate limit: 2 seconds between posts to avoid hitting Meta API limits
      await delay(2000);
    } catch (err: any) {
      item.status = "failed";
      item.error = err.message;
      console.error(`[smi-scheduler] Error posting ${item.id}: ${err.message}`);
      logEvent({ type: "post_failed", pipeline: item.pipeline, summary: `Error posting ${item.pipeline}: ${err.message}` });
    }
  }

  // Update schedule file
  writeJSON(schedulePath(dateStr), schedule);
}
