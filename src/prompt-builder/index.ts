import { Constitution } from "../tiers/constitution";
import { Soul } from "../tiers/soul";
import { Tactics, PillarPerformance } from "../tiers/tactics";
import { Pipeline, postsHistoryPath } from "../storage/paths";
import { getPrimaryMetric } from "../analysis/analyzer";
import { readJSONL } from "../storage/files";
import { PostHistoryEntry } from "../tools/post-content";
import { buildReelsPromptTemplate } from "./reels";
import { buildImagePostsPromptTemplate } from "./image-posts";
import { buildStoriesPromptTemplate } from "./stories";

export interface GenerationContext {
  constitution: Constitution;
  soul: Soul;
  tactics: Tactics;
  pipeline_template: string;
}

/**
 * Load the last N posts for a pipeline from JSONL history.
 */
export function loadRecentPosts(pipeline: Pipeline, count: number = 10): PostHistoryEntry[] {
  const all = readJSONL<PostHistoryEntry>(postsHistoryPath());
  return all
    .filter((p) => p.pipeline === pipeline)
    .slice(-count);
}

/**
 * Build the complete generation context by merging all three tiers.
 * The agent uses this context to craft content generation prompts.
 */
export function buildGenerationContext(
  constitution: Constitution,
  soul: Soul,
  tactics: Tactics,
  pipeline: Pipeline
): GenerationContext {
  const recentPosts = loadRecentPosts(pipeline);
  let pipelineTemplate: string;

  switch (pipeline) {
    case "reels":
      pipelineTemplate = buildReelsPromptTemplate(constitution, soul, tactics, recentPosts);
      break;
    case "image_posts":
      pipelineTemplate = buildImagePostsPromptTemplate(constitution, soul, tactics, recentPosts);
      break;
    case "stories":
      pipelineTemplate = buildStoriesPromptTemplate(constitution, soul, tactics, recentPosts);
      break;
    default:
      throw new Error(`Unknown pipeline: ${pipeline}`);
  }

  return {
    constitution,
    soul,
    tactics,
    pipeline_template: pipelineTemplate,
  };
}

/**
 * Format content pillars with weights for prompt context.
 */
export function formatContentPillars(soul: Soul): string {
  return soul.content_pillars
    .map((p) => `- ${p.name} (${Math.round(p.weight * 100)}%): ${p.description}`)
    .join("\n");
}

/**
 * Format brand constraints from Constitution for prompt context.
 */
export function formatConstraints(constitution: Constitution): string {
  const lines: string[] = [];

  lines.push("## Hard Constraints (Constitution)");
  lines.push("### Banned Topics");
  constitution.banned_topics.forEach((t) => lines.push(`- ${t}`));

  lines.push("\n### Required Disclosures");
  constitution.content_policies.required_disclosures.forEach((d) =>
    lines.push(`- Include: ${d}`)
  );

  lines.push("\n### Brand Red Lines");
  constitution.brand_red_lines.forEach((r) => lines.push(`- ${r}`));

  if (constitution.media_generation_rules?.length) {
    lines.push("\n### AI Media Generation Rules");
    lines.push("When crafting prompts for Sora (video) or Grok Imagine (images), ALWAYS follow these rules:");
    constitution.media_generation_rules.forEach((r) => lines.push(`- ${r}`));
  }

  return lines.join("\n");
}

/**
 * Format the brand voice section from Soul.
 */
export function formatBrandVoice(soul: Soul): string {
  return [
    "## Brand Voice (Soul)",
    `Tone: ${soul.brand_voice.tone}`,
    `Personality: ${soul.brand_voice.personality_traits.join(", ")}`,
    `Writing Style: ${soul.brand_voice.writing_style}`,
    "",
    "## Target Audience",
    `Primary: ${soul.audience.primary_demographic}`,
    `Interests: ${soul.audience.interests.join(", ")}`,
    `Pain Points: ${soul.audience.pain_points.join(", ")}`,
    "",
    "## Content Pillars",
    formatContentPillars(soul),
    "",
    "## Visual Identity",
    `Aesthetics: ${soul.visual_identity.preferred_aesthetics}`,
    `Colors: ${soul.visual_identity.color_palette.join(", ")}`,
    `Logo: ${soul.visual_identity.logo_usage}`,
  ].join("\n");
}

/**
 * Format evidence-backed tactics for prompt context.
 */
export function formatTactics(tactics: Tactics): string {
  const lines: string[] = [];

  lines.push(`## Current Tactics (v${tactics.version}) — Evidence-Backed`);

  lines.push("\n### Visual Style");
  lines.push(`Best approach: ${tactics.visual_style.current_best}`);
  lines.push(`Color trends: ${tactics.visual_style.color_trends}`);
  lines.push(`Hook style: ${tactics.visual_style.hook_style}`);

  lines.push("\n### Caption Patterns");
  lines.push(
    `Optimal length: ~${tactics.caption_patterns.optimal_length.chars} chars (confidence: ${Math.round(tactics.caption_patterns.optimal_length.confidence * 100)}%)`
  );
  lines.push(`CTA style: ${tactics.caption_patterns.cta_style}`);
  lines.push(`Emoji usage: ${tactics.caption_patterns.emoji_usage}`);

  lines.push("\n### Hashtag Strategy");
  lines.push(`Optimal count: ${tactics.hashtag_strategy.optimal_count}`);
  if (tactics.hashtag_strategy.top_performing.length > 0) {
    lines.push(`Top performing: ${tactics.hashtag_strategy.top_performing.join(", ")}`);
  }

  if (tactics.learnings.length > 0) {
    lines.push("\n### Recent Learnings");
    const recentLearnings = tactics.learnings.slice(-5);
    recentLearnings.forEach((l) => {
      lines.push(`- [${l.date}] ${l.insight}`);
      lines.push(`  Evidence: ${l.evidence}`);
    });
  }

  return lines.join("\n");
}

/**
 * Format content pillar performance data for prompt context.
 * Shows pillars ranked by the pipeline's primary metric with FB-native metrics.
 */
export function formatPillarPerformance(tactics: Tactics, pipeline: Pipeline): string {
  if (!tactics.content_pillar_performance?.length) return "";

  const primaryMetric = getPrimaryMetric(pipeline);
  const metricLabel = primaryMetric === "avg_watch_time_ms" ? "avg watch time" : "engagement rate";

  const lines: string[] = [];
  lines.push("## Content Pillar Performance (from data)");
  lines.push(`Ranked by ${metricLabel} for this pipeline:\n`);

  // Sort by primary metric descending
  const sorted = [...tactics.content_pillar_performance].sort(
    (a, b) => (b as any)[primaryMetric] - (a as any)[primaryMetric]
  );

  sorted.forEach((p, i) => {
    const watchStr = `${(p.avg_watch_time_ms / 1000).toFixed(1)}s avg watch`;
    const distStr = p.distribution_avg !== 0
      ? `${p.distribution_avg >= 0 ? "+" : ""}${p.distribution_avg.toFixed(2)}x distribution`
      : "no distribution data";
    const engStr = `${(p.engagement_rate * 100).toFixed(1)}% engagement`;

    lines.push(
      `${i + 1}. ${p.pillar} — ${watchStr}, ${distStr}, ${engStr} (${p.post_count} posts, trending: ${p.trend})`
    );
  });

  const declining = sorted.filter((p) => p.trend === "declining");
  if (declining.length > 0) {
    lines.push("");
    for (const p of declining) {
      lines.push(`Warning: "${p.pillar}" is declining — try fresh themes or reduce weight.`);
    }
  }

  return lines.join("\n");
}

/**
 * Format account engagement profile for prompt context.
 * Shows FB-native performance signals and primary strength.
 */
export function formatEngagementProfile(tactics: Tactics): string {
  if (!tactics.account_engagement_profile?.engagement_rate_avg) return "";

  const ep = tactics.account_engagement_profile;

  const strengthDescriptions: Record<string, string> = {
    retention: "viewers watch your content longer than average",
    engagement: "your content drives reactions and interactions",
    hooks: "your first frames stop the scroll effectively",
    distribution: "the algorithm favors your content for distribution",
  };

  const strengthAdvice: Record<string, string> = {
    retention: "Your audience stays when they click. Focus on hooks to get more clicks.",
    engagement: "Optimize for shareable, relatable content that drives reactions and comments.",
    hooks: "Your hooks are strong. Focus on retention — keep viewers watching after the first frame.",
    distribution: "The algorithm likes your content. Maintain quality and consistency.",
  };

  const lines: string[] = [];
  lines.push("## Your Account's Performance Profile");
  lines.push(`Primary strength: ${ep.primary_strength} (${strengthDescriptions[ep.primary_strength]})`);
  lines.push(
    `Avg metrics: ${(ep.avg_watch_time_ms / 1000).toFixed(1)}s watch time, ${ep.hook_rate_avg.toFixed(2)} hook rate, ${ep.distribution_avg >= 0 ? "+" : ""}${ep.distribution_avg.toFixed(2)}x distribution, ${(ep.engagement_rate_avg * 100).toFixed(1)}% engagement`
  );
  lines.push("");
  lines.push(strengthAdvice[ep.primary_strength]);

  return lines.join("\n");
}

/**
 * Format distribution score insights for prompt context.
 * Surfaces what correlates with positive distribution scores.
 */
export function formatDistributionInsights(tactics: Tactics): string {
  if (!tactics.content_pillar_performance?.length) return "";

  const pillarsWithDist = tactics.content_pillar_performance.filter(
    (p) => p.distribution_avg !== 0
  );
  if (pillarsWithDist.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Distribution Insights (Algorithm Signals)");
  lines.push("FB's distribution score tells us what the algorithm favors:\n");

  const sorted = [...pillarsWithDist].sort((a, b) => b.distribution_avg - a.distribution_avg);
  for (const p of sorted) {
    const sign = p.distribution_avg >= 0 ? "+" : "";
    lines.push(
      `- ${p.pillar}: ${sign}${p.distribution_avg.toFixed(2)}x distribution, ${(p.avg_watch_time_ms / 1000).toFixed(1)}s watch time`
    );
  }

  const best = sorted[0];
  if (best.distribution_avg > 0) {
    lines.push(`\nThe algorithm favors "${best.pillar}" content — lean into this pillar.`);
  }

  return lines.join("\n");
}

/**
 * Format recent post summaries with a repetition warning.
 * Appends distribution score and hook style when available.
 */
export function formatRecentPosts(posts: PostHistoryEntry[]): string {
  if (posts.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Recent Posts (Avoid Repetition)");
  lines.push(`You have ${posts.length} recent post(s) in this pipeline. Do NOT repeat similar concepts.\n`);

  for (const p of posts.slice(-5)) {
    const pillar = p.content_pillar || "uncategorized";
    const date = p.posted_at.split("T")[0];
    let line = `- [${date}] Pillar: ${pillar} — "${p.caption.slice(0, 80)}${p.caption.length > 80 ? "..." : ""}"`;

    const extras: string[] = [];
    if (p.metrics.distribution !== null && p.metrics.distribution !== undefined) {
      const sign = p.metrics.distribution >= 0 ? "+" : "";
      extras.push(`dist: ${sign}${p.metrics.distribution.toFixed(2)}x`);
    }
    if (p.generation_log?.tactics_snapshot?.hook_style) {
      extras.push(`hook: ${p.generation_log.tactics_snapshot.hook_style}`);
    }
    if (extras.length > 0) {
      line += ` (${extras.join(", ")})`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Format generation insights from top-performing posts.
 * Shows what worked for the best posts by distribution score.
 */
export function formatGenerationInsights(posts: PostHistoryEntry[], pipeline: Pipeline): string {
  const postsWithData = posts.filter(
    (p) =>
      p.generation_log?.media_prompt &&
      p.metrics.distribution !== null &&
      p.metrics.distribution !== undefined
  );
  if (postsWithData.length < 3) return "";

  // Sort by distribution descending, take top 3
  const top = [...postsWithData]
    .sort((a, b) => (b.metrics.distribution || 0) - (a.metrics.distribution || 0))
    .slice(0, 3);

  const lines: string[] = [];
  lines.push("## What Worked — Generation Insights from Top Posts");
  lines.push(`Based on your ${postsWithData.length} posts with generation data:\n`);

  for (const p of top) {
    const dist = p.metrics.distribution || 0;
    const sign = dist >= 0 ? "+" : "";
    const hookStyle = p.generation_log!.tactics_snapshot.hook_style;
    const visualStyle = p.generation_log!.tactics_snapshot.visual_style;
    const prompt = p.generation_log!.media_prompt;
    const truncatedPrompt = prompt.length > 150 ? prompt.slice(0, 150) + "..." : prompt;
    const captionLen = p.caption.length;

    lines.push(`- **${sign}${dist.toFixed(2)}x distribution** | Hook: ${hookStyle} | Visual: ${visualStyle}`);
    lines.push(`  Media prompt: "${truncatedPrompt}"`);
    lines.push(`  Caption length: ${captionLen} chars`);
  }

  return lines.join("\n");
}

/**
 * Calculate pillar distribution vs target weights, recommend next pillar, and surface content themes.
 */
export function formatPillarRotation(soul: Soul, posts: PostHistoryEntry[], tactics?: Tactics): string {
  if (!soul.creative_direction) return "";
  if (soul.content_pillars.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Content Pillar Rotation");

  // Count actual distribution
  const counts: Record<string, number> = {};
  for (const pillar of soul.content_pillars) {
    counts[pillar.name] = 0;
  }
  for (const p of posts) {
    const pillar = p.content_pillar || "uncategorized";
    if (counts[pillar] !== undefined) {
      counts[pillar]++;
    }
  }

  const total = posts.length || 1;

  lines.push("\n### Actual vs Target Distribution");
  let mostUnderserved = { name: soul.content_pillars[0].name, gap: -Infinity };
  for (const pillar of soul.content_pillars) {
    const actual = Math.round((counts[pillar.name] / total) * 100);
    const target = Math.round(pillar.weight * 100);
    const gap = target - actual;
    lines.push(`- ${pillar.name}: ${actual}% actual vs ${target}% target (${gap > 0 ? "+" : ""}${gap}% gap)`);
    if (gap > mostUnderserved.gap) {
      mostUnderserved = { name: pillar.name, gap };
    }
  }

  lines.push(`\n**Recommended next pillar: ${mostUnderserved.name}** (most underrepresented)`);

  // Surface top performer from pillar performance data if available
  if (tactics?.content_pillar_performance?.length) {
    const topPerformer = tactics.content_pillar_performance[0];
    if (topPerformer && topPerformer.pillar !== mostUnderserved.name) {
      lines.push(`**Top performing pillar: ${topPerformer.pillar}** (best engagement data)`);
      lines.push(`Consider balancing between underrepresented and best-performing.`);
    }
  }

  // Surface content themes for the recommended pillar
  const themes = soul.creative_direction.content_themes.find(
    (t) => t.pillar === mostUnderserved.name
  );
  if (themes && themes.ideas.length > 0) {
    lines.push(`\nContent ideas for "${mostUnderserved.name}":`);
    for (const idea of themes.ideas) {
      lines.push(`- ${idea}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format example prompts filtered by tool type (sora or grok).
 */
export function formatCreativeExamples(soul: Soul, tool: "sora" | "grok"): string {
  if (!soul.creative_direction) return "";

  const examples = soul.creative_direction.example_prompts.filter((e) => e.tool === tool);
  if (examples.length === 0) return "";

  const toolName = tool === "sora" ? "Sora" : "Grok";
  const lines: string[] = [];
  lines.push(`## Example ${toolName} Prompts (Reference Style)`);
  lines.push("Use these as style references — do NOT copy them verbatim.\n");

  for (const ex of examples) {
    lines.push(`- **Prompt**: "${ex.prompt}"`);
    lines.push(`  What works: ${ex.description}\n`);
  }

  return lines.join("\n");
}

/**
 * Format example captions, preferring pipeline-specific ones.
 */
export function formatExampleCaptions(soul: Soul, pipeline?: Pipeline): string {
  if (!soul.creative_direction) return "";

  const all = soul.creative_direction.example_captions;
  if (all.length === 0) return "";

  // Prefer pipeline-specific, then show general ones
  const specific = pipeline ? all.filter((c) => c.pipeline === pipeline) : [];
  const general = all.filter((c) => !c.pipeline);
  const toShow = specific.length > 0 ? specific : general.length > 0 ? general : all;

  const lines: string[] = [];
  lines.push("## Example Captions (Reference Style)");
  lines.push("Match this tone and structure — do NOT copy verbatim.\n");

  for (const cap of toShow) {
    lines.push(`- "${cap.text.slice(0, 120)}${cap.text.length > 120 ? "..." : ""}"`);
    lines.push(`  What works: ${cap.what_works}\n`);
  }

  return lines.join("\n");
}

/**
 * Format negative guidance: things to avoid in visuals, captions, and themes.
 */
export function formatNegativeGuidance(soul: Soul): string {
  if (!soul.creative_direction) return "";

  const ng = soul.creative_direction.negative_guidance;
  if (!ng) return "";

  const hasContent =
    ng.visual_avoid?.length || ng.caption_avoid?.length || ng.theme_avoid?.length;
  if (!hasContent) return "";

  const lines: string[] = [];
  lines.push("## Negative Guidance (Never Do This)");

  if (ng.visual_avoid?.length) {
    lines.push("\n### Visual Avoid");
    for (const item of ng.visual_avoid) {
      lines.push(`- ${item}`);
    }
  }
  if (ng.caption_avoid?.length) {
    lines.push("\n### Caption Avoid");
    for (const item of ng.caption_avoid) {
      lines.push(`- ${item}`);
    }
  }
  if (ng.theme_avoid?.length) {
    lines.push("\n### Theme Avoid");
    for (const item of ng.theme_avoid) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format video duration, hook window, structure, and pacing guidance.
 */
export function formatDurationPacing(soul: Soul): string {
  if (!soul.creative_direction) return "";

  const dp = soul.creative_direction.duration_pacing;
  if (!dp) return "";

  const lines: string[] = [];
  lines.push("## Video Duration & Pacing");
  lines.push(`- Target duration: ${dp.preferred_duration_seconds} seconds`);
  lines.push(`- Pacing: ${dp.pacing}`);
  lines.push(`- Hook window: first ${dp.hook_duration_seconds} second(s)`);
  lines.push(`- Structure: ${dp.structure}`);

  return lines.join("\n");
}

/**
 * Format platform-specific tweaks for IG and FB based on current pipeline.
 */
export function formatPlatformTweaks(soul: Soul, pipeline: Pipeline): string {
  if (!soul.creative_direction) return "";

  const pt = soul.creative_direction.platform_tweaks;
  if (!pt) return "";

  const lines: string[] = [];
  lines.push("## Platform-Specific Notes");

  if (pt.instagram) {
    lines.push("\n### Instagram");
    if (pipeline === "reels") {
      lines.push(`- Reel style: ${pt.instagram.reel_style}`);
    } else if (pipeline === "stories") {
      lines.push(`- Story style: ${pt.instagram.story_style}`);
    } else {
      lines.push(`- Feed aesthetic: ${pt.instagram.feed_aesthetic}`);
    }
  }

  if (pt.facebook) {
    lines.push("\n### Facebook");
    lines.push(`- Post style: ${pt.facebook.post_style}`);
    lines.push(`- Audience difference: ${pt.facebook.audience_difference}`);
  }

  return lines.join("\n");
}
