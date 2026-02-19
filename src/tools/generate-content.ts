import * as path from "path";
import { buildGenerationContextTool } from "./build-generation-context";
import { ensureDir } from "../storage/files";
import { stagingDir, Pipeline } from "../storage/paths";

export interface GenerateContentParams {
  pipeline: Pipeline;
}

export interface GenerateContentResult {
  success: boolean;
  pipeline: Pipeline;
  pipeline_template?: string;
  staging_dir?: string;
  media_tool?: "generate_image" | "generate_video";
  recommended_aspect_ratio?: string;
  recommended_filename?: string;
  error?: string;
}

/**
 * Tool: smi_generate_content
 *
 * Full orchestrator for content generation. Builds the three-tier generation
 * context for a pipeline and returns creative direction plus staging info,
 * so the agent can craft a prompt and call the appropriate MCP browser tool.
 *
 * This is a two-step flow from the agent's perspective:
 *   1. Call smi_generate_content({ pipeline }) → gets creative context + staging dir
 *   2. Call MCP tool generate_image() or generate_video() with crafted prompt
 *
 * After media is generated, the agent writes a caption, selects hashtags,
 * and calls smi_post_content (or saves to schedule for later posting).
 */
export async function generateContentTool(
  params: GenerateContentParams
): Promise<GenerateContentResult> {
  try {
    const { pipeline } = params;

    if (!["reels", "image_posts", "stories"].includes(pipeline)) {
      return {
        success: false,
        pipeline,
        error: `Invalid pipeline: "${pipeline}". Must be "reels", "image_posts", or "stories".`,
      };
    }

    // Build the three-tier generation context
    const contextResult = await buildGenerationContextTool({ pipeline });

    if (!contextResult.success || !contextResult.context) {
      return {
        success: false,
        pipeline,
        error: contextResult.error || "Failed to build generation context",
      };
    }

    // Prepare staging directory for today
    const today = new Date().toISOString().split("T")[0];
    const todayStagingDir = path.join(stagingDir(), today);
    ensureDir(todayStagingDir);

    // Determine which MCP tool the agent should call
    const mediaTool: "generate_image" | "generate_video" =
      pipeline === "reels" ? "generate_video" : "generate_image";

    // Recommended aspect ratio based on pipeline
    const aspectRatioMap: Record<Pipeline, string> = {
      reels: "9:16",
      image_posts: "1:1",
      stories: "9:16",
    };

    // Recommended filename with timestamp to avoid collisions
    const timestamp = Date.now();
    const ext = mediaTool === "generate_video" ? "mp4" : "png";
    const recommendedFilename = `${pipeline}-${timestamp}.${ext}`;

    return {
      success: true,
      pipeline,
      pipeline_template: contextResult.context.pipeline_template,
      staging_dir: todayStagingDir,
      media_tool: mediaTool,
      recommended_aspect_ratio: aspectRatioMap[pipeline],
      recommended_filename: recommendedFilename,
    };
  } catch (err: any) {
    return {
      success: false,
      pipeline: params.pipeline,
      error: err.message,
    };
  }
}
