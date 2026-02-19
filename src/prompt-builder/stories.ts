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
  formatNegativeGuidance,
  formatRecentPosts,
  formatPillarRotation,
  formatCreativeExamples,
  formatExampleCaptions,
  formatPlatformTweaks,
} from "./index";

/**
 * Build the Stories-specific prompt template.
 * This template guides the agent in crafting Stories content —
 * optionally generating images via Grok, plus text overlays and interactive elements.
 */
export function buildStoriesPromptTemplate(
  constitution: Constitution,
  soul: Soul,
  tactics: Tactics,
  recentPosts: PostHistoryEntry[] = []
): string {
  // Build interactive guidance from recent stories engagement data
  const interactiveGuidance = buildInteractiveGuidance(recentPosts);

  return `# Stories Content Generation Context

You are generating a Story for Instagram and Facebook.
Stories are ephemeral (24h) and should feel casual, authentic, and engaging.
Use this context to create Story concepts with optional image generation.

${formatConstraints(constitution)}

${formatBrandVoice(soul)}

${formatNegativeGuidance(soul)}

${formatTactics(tactics)}

${formatPillarPerformance(tactics, "stories")}

${formatEngagementProfile(tactics)}

${formatRecentPosts(recentPosts)}

${formatPillarRotation(soul, recentPosts, tactics)}

${formatCreativeExamples(soul, "grok")}

${formatExampleCaptions(soul, "stories")}

${formatPlatformTweaks(soul, "stories")}

**Note:** Story performance analysis is currently paused — FB story metrics are unreliable after 24h expiry. Rely on general tactics and brand voice for now.

## Stories-Specific Guidelines

### Story Concept
- Stories should feel more casual and behind-the-scenes than feed posts
- Use interactive elements: polls, questions, quizzes, sliders, countdowns
- Current best approach: ${tactics.visual_style.current_best}
- Hook style: ${tactics.visual_style.hook_style}

### Visual Direction
- If generating an image via Grok, keep it simpler than feed posts
- Color approach: ${tactics.visual_style.color_trends}
- Match brand aesthetics: ${soul.visual_identity.preferred_aesthetics}
- Stories can use more playful, informal visuals

### Text Overlay
- Keep text short and punchy — ${tactics.caption_patterns.optimal_length.chars} chars max
- ${tactics.caption_patterns.emoji_usage}
- Use the brand voice but slightly more casual: ${soul.brand_voice.tone}

### Interactive Elements
- Choose ONE interactive element per story:
  - Poll: Binary choice that relates to content pillar
  - Question: Open-ended prompt for audience input
  - Quiz: Fun trivia related to your niche
  - Slider: Emoji rating for visual content
  - Countdown: For upcoming content or events
${interactiveGuidance}

### Hashtag/Mention Strategy
- Use ${tactics.hashtag_strategy.optimal_count} hashtags (can be smaller/hidden)
- Include required disclosures: ${constitution.content_policies.required_disclosures.join(", ")}

### Posting Schedule
- Best times: ${tactics.posting_times.best_slots.join(", ")} (${tactics.posting_times.timezone})
- Space stories throughout the day for consistent presence

### Output Format
Provide your response as:
1. **Story Type**: image-only | text-overlay | interactive
2. **Grok Image Prompt** (if using generated image): The exact prompt
3. **Text Overlay**: Text to display on the story
4. **Interactive Element**: Type + content (e.g., "Poll: Option A vs Option B")
5. **Content Pillar**: Which pillar this content serves
6. **Rationale**: Why this story concept aligns with current evidence
`;
}

/**
 * Build interactive element guidance from recent stories engagement data.
 */
function buildInteractiveGuidance(recentPosts: PostHistoryEntry[]): string {
  if (recentPosts.length === 0) return "";

  const withEngagement = recentPosts.filter((p) => (p.metrics.engagement_rate || 0) > 0);
  if (withEngagement.length === 0) return "";

  // Sort by engagement rate and surface top performers
  const sorted = [...withEngagement].sort(
    (a, b) => (b.metrics.engagement_rate || 0) - (a.metrics.engagement_rate || 0)
  );
  const top = sorted[0];

  const lines: string[] = [];
  lines.push(`- Recent top story had ${((top.metrics.engagement_rate || 0) * 100).toFixed(1)}% engagement rate (${top.metrics.engagement || 0} engagement, ${top.metrics.comments} comments)`);
  if (sorted.length >= 3) {
    const avgRate =
      sorted.reduce((sum, p) => sum + (p.metrics.engagement_rate || 0), 0) / sorted.length;
    lines.push(`- Average story engagement rate: ${(avgRate * 100).toFixed(1)}%`);
  }

  return lines.join("\n");
}
