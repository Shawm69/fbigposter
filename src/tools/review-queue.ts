import { readJSON } from "../storage/files";
import { soulProposalsPath, schedulePath } from "../storage/paths";
import { SoulProposal } from "../tiers/soul";

export interface ReviewQueueParams {
  type?: "soul_proposals" | "scheduled_content" | "all";
}

export interface ScheduledContentItem {
  pipeline: string;
  media_path: string;
  caption: string;
  hashtags: string[];
  posting_time: string;
  status: "pending" | "posted" | "failed";
}

export interface DailySchedule {
  date: string;
  items: ScheduledContentItem[];
}

export interface ReviewQueueResult {
  success: boolean;
  soul_proposals?: SoulProposal[];
  scheduled_content?: DailySchedule[];
  error?: string;
}

/**
 * Tool: smi_review_queue
 *
 * List pending items: soul change proposals and/or scheduled content.
 */
export async function reviewQueueTool(
  params: ReviewQueueParams
): Promise<ReviewQueueResult> {
  try {
    const type = params.type || "all";
    const result: ReviewQueueResult = { success: true };

    // Load soul proposals if requested
    if (type === "soul_proposals" || type === "all") {
      const allProposals = readJSON<SoulProposal[]>(soulProposalsPath()) || [];
      result.soul_proposals = allProposals.filter((p) => p.status === "pending");
    }

    // Load scheduled content if requested
    if (type === "scheduled_content" || type === "all") {
      const schedules: DailySchedule[] = [];

      // Check today and tomorrow
      const today = new Date();
      for (let i = 0; i < 2; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        const schedule = readJSON<DailySchedule>(schedulePath(dateStr));
        if (schedule) {
          schedules.push(schedule);
        }
      }

      result.scheduled_content = schedules;
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
    };
  }
}
