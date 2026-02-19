import { loadConstitution } from "../tiers/constitution";
import { loadSoul } from "../tiers/soul";
import { loadTactics } from "../tiers/tactics";
import { buildGenerationContext, GenerationContext } from "../prompt-builder";
import { Pipeline } from "../storage/paths";

export interface BuildGenerationContextParams {
  pipeline: Pipeline;
}

export interface BuildGenerationContextResult {
  success: boolean;
  context?: GenerationContext;
  error?: string;
}

/**
 * Tool: smi_build_generation_context
 *
 * Assembles the current three-tier context for a pipeline so the agent
 * can generate content. This does NOT plan specific posts — it gives
 * the agent the current rules, voice, and evidence-backed creative direction.
 */
export async function buildGenerationContextTool(
  params: BuildGenerationContextParams
): Promise<BuildGenerationContextResult> {
  try {
    const { pipeline } = params;

    if (!["reels", "image_posts", "stories"].includes(pipeline)) {
      return {
        success: false,
        error: `Invalid pipeline: "${pipeline}". Must be "reels", "image_posts", or "stories".`,
      };
    }

    // Load all three tiers
    const constitution = loadConstitution();
    const soul = loadSoul();
    const tactics = loadTactics(pipeline);

    // Build the merged generation context
    const context = buildGenerationContext(constitution, soul, tactics, pipeline);

    return {
      success: true,
      context,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
    };
  }
}
