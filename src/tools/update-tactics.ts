import { Pipeline } from "../storage/paths";
import { updateTactics } from "../tiers/tactics";

export interface UpdateTacticsParams {
  pipeline: Pipeline;
  updates: Array<{
    field: string;
    new_value: any;
    evidence: string;
  }>;
}

export interface UpdateTacticsResult {
  success: boolean;
  pipeline: string;
  new_version?: number;
  changes_applied?: string[];
  error?: string;
}

/**
 * Tool: smi_update_tactics
 *
 * Apply analyzed findings to a pipeline's tactics file.
 * Increments version, applies updates, appends learnings with evidence.
 */
export async function updateTacticsTool(
  params: UpdateTacticsParams
): Promise<UpdateTacticsResult> {
  try {
    const { pipeline, updates } = params;

    if (!["reels", "image_posts", "stories"].includes(pipeline)) {
      return {
        success: false,
        pipeline,
        error: `Invalid pipeline: "${pipeline}". Must be "reels", "image_posts", or "stories".`,
      };
    }

    if (!updates || updates.length === 0) {
      return {
        success: false,
        pipeline,
        error: "No updates provided.",
      };
    }

    // Validate each update has required fields
    for (const update of updates) {
      if (!update.field || update.new_value === undefined || !update.evidence) {
        return {
          success: false,
          pipeline,
          error: `Each update must have "field", "new_value", and "evidence". Invalid update: ${JSON.stringify(update)}`,
        };
      }
    }

    const result = updateTactics(pipeline, updates);

    return {
      success: true,
      ...result,
    };
  } catch (err: any) {
    return {
      success: false,
      pipeline: params.pipeline,
      error: err.message,
    };
  }
}
