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
  formatPlatformTweaks,
} from "./index";

/**
 * Build the Image Posts-specific prompt template.
 * This template guides the agent in crafting Grok prompts for image generation
 * and writing captions for feed posts.
 */
export function buildImagePostsPromptTemplate(
  constitution: Constitution,
  soul: Soul,
  tactics: Tactics,
  recentPosts: PostHistoryEntry[] = []
): string {
  return `# Image Post Content Generation Context

You are generating an image post for Instagram and Facebook feed.
Use this context to craft both a Grok image generation prompt AND a caption.

${formatConstraints(constitution)}

${formatBrandVoice(soul)}

${formatNegativeGuidance(soul)}

${formatTactics(tactics)}

${formatPillarPerformance(tactics, "image_posts")}

${formatEngagementProfile(tactics)}

${formatDistributionInsights(tactics)}

${formatRecentPosts(recentPosts)}

${formatGenerationInsights(recentPosts, "image_posts")}

${formatPillarRotation(soul, recentPosts, tactics)}

${formatCreativeExamples(soul, "grok")}

${formatExampleCaptions(soul, "image_posts")}

${formatPlatformTweaks(soul, "image_posts")}

## Image Post-Specific Guidelines

### Grok Image Prompt Crafting
- Create an image prompt that aligns with the current visual style evidence
- Style direction: ${tactics.visual_style.current_best}
- Color approach: ${tactics.visual_style.color_trends}
- Visual hook: ${tactics.visual_style.hook_style}
- Match the brand's visual identity: ${soul.visual_identity.preferred_aesthetics}
- Incorporate brand colors: ${soul.visual_identity.color_palette.join(", ")}
- The image should stop the scroll — make it visually striking

### Caption Writing
- Target ~${tactics.caption_patterns.optimal_length.chars} characters
- Use ${tactics.caption_patterns.cta_style}
- ${tactics.caption_patterns.emoji_usage}
- Write in the brand voice: ${soul.brand_voice.tone}
- Address audience pain points: ${soul.audience.pain_points.join(", ")}

### Hashtag Selection
- Use ${tactics.hashtag_strategy.optimal_count} hashtags
${tactics.hashtag_strategy.top_performing.length > 0 ? `- Proven performers: ${tactics.hashtag_strategy.top_performing.join(", ")}` : "- No proven hashtags yet — experiment with niche-relevant tags"}
- Always include required disclosures: ${constitution.content_policies.required_disclosures.join(", ")}

### Posting Schedule
- Best times: ${tactics.posting_times.best_slots.join(", ")} (${tactics.posting_times.timezone})
- Confidence: ${Math.round(tactics.posting_times.confidence * 100)}%

### Output Format
Provide your response as:
1. **Grok Image Prompt**: The exact prompt to send to Grok for image generation
2. **Caption**: The post caption
3. **Hashtags**: Array of hashtags to use
4. **Content Pillar**: Which pillar this content serves
5. **Rationale**: Why this content aligns with current evidence
`;
}
