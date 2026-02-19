import { Constitution } from "../tiers/constitution";
import { Soul } from "../tiers/soul";
import { Tactics } from "../tiers/tactics";
import { PostHistoryEntry } from "../tools/post-content";
import {
  formatConstraints,
  formatBrandVoice,
  formatTactics,
  formatPillarPerformance,
  formatEngagementProfile,
  formatDistributionInsights,
  formatNegativeGuidance,
  formatRecentPosts,
  formatGenerationInsights,
  formatPillarRotation,
  formatCreativeExamples,
  formatExampleCaptions,
  formatDurationPacing,
  formatPlatformTweaks,
} from "./index";

/**
 * Build the Reels-specific prompt template.
 * This template guides the agent in crafting Sora prompts for video generation
 * and writing captions for Reels.
 */
export function buildReelsPromptTemplate(
  constitution: Constitution,
  soul: Soul,
  tactics: Tactics,
  recentPosts: PostHistoryEntry[] = []
): string {
  const dp = soul.creative_direction?.duration_pacing;

  return `# Reels Content Generation Context

You are generating a Reel (short-form video) for Instagram and Facebook.
Use this context to craft both a Sora video generation prompt AND a caption.

${formatConstraints(constitution)}

${formatBrandVoice(soul)}

${formatNegativeGuidance(soul)}

${formatTactics(tactics)}

${formatPillarPerformance(tactics, "reels")}

${formatEngagementProfile(tactics)}

${formatDistributionInsights(tactics)}

${formatRecentPosts(recentPosts)}

${formatGenerationInsights(recentPosts, "reels")}

${formatPillarRotation(soul, recentPosts, tactics)}

${formatCreativeExamples(soul, "sora")}

${formatExampleCaptions(soul, "reels")}

${formatDurationPacing(soul)}

${formatPlatformTweaks(soul, "reels")}

## Reels-Specific Guidelines

### Sora Prompt Crafting
- Create a video prompt that aligns with the current visual style evidence
- Hook style: ${tactics.visual_style.hook_style}
- Use ${tactics.visual_style.color_trends} in your visual direction
- Best performing approach: ${tactics.visual_style.current_best}
- Keep the Sora prompt detailed but focused on a single clear concept
${dp ? `- Target duration: ${dp.preferred_duration_seconds} seconds` : ""}
${dp ? `- Structure: ${dp.structure}` : ""}
${dp ? `- Hook window: first ${dp.hook_duration_seconds} second(s)` : ""}

### Caption Writing
- Target ~${tactics.caption_patterns.optimal_length.chars} characters
- Use ${tactics.caption_patterns.cta_style}
- ${tactics.caption_patterns.emoji_usage}
- End with a compelling call-to-action that invites engagement

### Hashtag Selection
- Use ${tactics.hashtag_strategy.optimal_count} hashtags
${tactics.hashtag_strategy.top_performing.length > 0 ? `- Proven performers: ${tactics.hashtag_strategy.top_performing.join(", ")}` : "- No proven hashtags yet — experiment with niche-relevant tags"}
- Always include required disclosures: ${constitution.content_policies.required_disclosures.join(", ")}

### Posting Schedule
- Best times: ${tactics.posting_times.best_slots.join(", ")} (${tactics.posting_times.timezone})
- Confidence: ${Math.round(tactics.posting_times.confidence * 100)}%

### Output Format
Provide your response as:
1. **Sora Prompt**: The exact prompt to send to Sora for video generation
2. **Caption**: The post caption
3. **Hashtags**: Array of hashtags to use
4. **Content Pillar**: Which pillar this content serves
5. **Rationale**: Why this content aligns with current evidence
`;
}
