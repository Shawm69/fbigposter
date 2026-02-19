import { Constitution, ContentPolicies } from "../tiers/constitution";
import { Soul, ContentPillar, CreativeDirection } from "../tiers/soul";
import { Tactics } from "../tiers/tactics";
import { PostHistoryEntry, GenerationLog } from "../tools/post-content";

export function makeConstitution(overrides?: Partial<Constitution>): Constitution {
  return {
    version: 1,
    banned_topics: ["gambling", "tobacco", "weapons"],
    legal_requirements: ["Must comply with FTC guidelines"],
    brand_red_lines: ["No profanity", "Never disparage competitors"],
    media_generation_rules: [
      "Never depict real people without consent",
      "Always maintain brand-safe imagery",
    ],
    content_policies: {
      max_posts_per_day: { reels: 3, image_posts: 5, stories: 10 },
      required_disclosures: ["#ad", "#sponsored"],
      forbidden_hashtags: ["#followforfollow", "#f4f", "#like4like"],
    },
    ...overrides,
  };
}

export function makeCreativeDirection(
  overrides?: Partial<CreativeDirection>
): CreativeDirection {
  return {
    example_prompts: [
      {
        tool: "sora",
        prompt: "A sunrise timelapse over a modern city skyline with warm golden tones",
        description: "Great cinematic feel, warm colors match brand palette",
      },
      {
        tool: "grok",
        prompt: "Flat-lay workspace with coffee, notebook, and laptop, minimalist style",
        description: "Clean aesthetic that resonates with productivity audience",
      },
    ],
    example_captions: [
      {
        text: "Your morning routine sets the tone for your entire day. Here are 3 micro-habits that take less than 5 minutes.",
        pipeline: "reels",
        what_works: "Opens with a relatable hook, provides specific value, short and punchy",
      },
      {
        text: "Behind every productive day is a system that works. What does yours look like?",
        what_works: "Invites engagement, conversational tone, ends with a question",
      },
    ],
    content_themes: [
      {
        pillar: "Tips & Tricks",
        ideas: [
          "5-minute morning routines",
          "Desk setup optimization",
          "Focus technique comparisons",
        ],
      },
      {
        pillar: "Behind the Scenes",
        ideas: ["Day-in-the-life vlogs", "Tool reviews", "Workspace tours"],
      },
    ],
    negative_guidance: {
      visual_avoid: ["cluttered backgrounds", "stock photo aesthetics"],
      caption_avoid: ["clickbait phrases", "excessive exclamation marks"],
      theme_avoid: ["hustle culture", "toxic productivity"],
    },
    duration_pacing: {
      preferred_duration_seconds: 12,
      pacing: "fast cuts, 2-3 second scenes",
      hook_duration_seconds: 2,
      structure: "hook -> problem -> solution -> CTA",
    },
    platform_tweaks: {
      instagram: {
        feed_aesthetic: "cohesive warm-toned grid",
        story_style: "casual polls and behind-the-scenes",
        reel_style: "trending audio with original visuals",
      },
      facebook: {
        post_style: "longer captions with storytelling",
        audience_difference: "older demographic, more shares and comments",
      },
    },
    ...overrides,
  };
}

export function makeSoul(overrides?: Partial<Soul>): Soul {
  return {
    version: 1,
    last_modified: "2026-01-01T00:00:00.000Z",
    brand_voice: {
      tone: "friendly and approachable",
      personality_traits: ["witty", "authentic", "helpful"],
      writing_style: "conversational with short sentences",
    },
    audience: {
      primary_demographic: "25-34 year old professionals",
      interests: ["fitness", "productivity", "self-improvement"],
      pain_points: ["lack of time", "motivation", "information overload"],
    },
    content_pillars: [
      { name: "Tips & Tricks", description: "Actionable advice", weight: 0.4 },
      { name: "Behind the Scenes", description: "Day-in-the-life content", weight: 0.3 },
      { name: "Community", description: "Engagement-driven content", weight: 0.3 },
    ],
    visual_identity: {
      color_palette: ["#FF6B35", "#004E89", "#FFFFFF"],
      preferred_aesthetics: "clean minimalist with bold accents",
      logo_usage: "bottom-right corner, semi-transparent",
    },
    creative_direction: makeCreativeDirection(),
    change_log: [],
    ...overrides,
  };
}

export function makeTactics(overrides?: Partial<Tactics>): Tactics {
  return {
    pipeline: "reels",
    version: 1,
    last_updated: "2026-01-15T00:00:00.000Z",
    posting_times: {
      best_slots: ["09:00", "18:00"],
      timezone: "America/New_York",
      confidence: 0.6,
      evidence: "Based on 20 posts",
    },
    visual_style: {
      current_best: "bold text overlay with motion graphics",
      color_trends: "warm tones with high contrast",
      hook_style: "question hook in first 2 seconds",
      evidence_posts: ["post-001", "post-002"],
    },
    caption_patterns: {
      optimal_length: { chars: 150, confidence: 0.7 },
      cta_style: "question-based CTAs",
      emoji_usage: "2-3 relevant emojis per caption",
    },
    hashtag_strategy: {
      optimal_count: 8,
      top_performing: ["#fitness", "#motivation", "#healthylifestyle"],
      recently_tested: [],
    },
    content_pillar_performance: [],
    account_engagement_profile: {
      primary_strength: "engagement",
      engagement_rate_avg: 0,
      comment_rate_avg: 0,
      avg_watch_time_ms: 0,
      hook_rate_avg: 0,
      distribution_avg: 0,
      rewatch_ratio_avg: 0,
    },
    learnings: [
      {
        date: "2026-01-10",
        insight: "Morning posts perform 20% better",
        evidence: "Based on 15 posts comparing AM vs PM",
        applied_to: "posting_times.best_slots",
      },
    ],
    ...overrides,
  };
}

export function makeGenerationLog(overrides?: Partial<GenerationLog>): GenerationLog {
  return {
    media_prompt: "A dynamic fitness montage with warm golden light, person doing morning yoga on rooftop at sunrise",
    pipeline_template: "# Reels Content Generation Context\n...",
    post_type: "reel",
    tactics_snapshot: {
      hook_style: "question hook in first 2 seconds",
      visual_style: "bold text overlay with motion graphics",
      color_trends: "warm tones with high contrast",
      cta_style: "question-based CTAs",
      emoji_usage: "2-3 relevant emojis per caption",
      optimal_length_chars: 150,
      optimal_hashtag_count: 8,
      top_pillar_at_creation: "Tips & Tricks",
      recommended_pillar_at_creation: "Behind the Scenes",
    },
    ...overrides,
  };
}

export function makePost(overrides?: Partial<PostHistoryEntry>): PostHistoryEntry {
  return {
    id: "post-001",
    pipeline: "reels",
    platform: "instagram",
    created_at: "2026-01-15T09:00:00.000Z",
    posted_at: "2026-01-15T09:00:00.000Z",
    post_type: "reel",
    caption: "Start your morning right! Here are 3 quick exercises.",
    hashtags: ["#fitness", "#morning", "#workout"],
    media_path: "/media/archive/reel-001.mp4",
    platform_post_id: "ig_12345",
    content_pillar: "Tips & Tricks",
    tactics_version_used: 1,
    soul_version_used: 1,
    metrics: {
      collected_at: "2026-01-16T00:00:00.000Z",
      // FB-native raw
      views: 4000,
      viewers: 3000,
      engagement: 245,
      comments: 30,
      net_follows: 5,
      impressions: 5000,
      distribution: 0.15,
      watch_time_ms: 21000,
      // Derived
      engagement_rate: 245 / 3000,
      comment_rate: 30 / 3000,
      hook_rate: 3000 / 5000,
      rewatch_ratio: 4000 / 3000,
      avg_watch_time_ms: 21000 / 3000,
      // Legacy
      reach: 3000,
      likes: 200,
      shares: 15,
      saves: 25,
      video_views: 4000,
      completion_rate: 0,
      profile_visits: 0,
      engagement_score: 0,
      save_rate: 0,
      share_rate: 0,
    },
    metrics_harvests: 1,
    metrics_complete: true,
    ...overrides,
  };
}

/**
 * Compute engagement score using the scrape-era formula:
 * engagement * 3 + viewers * 0.01
 */
export function computeEngagement(m: PostHistoryEntry["metrics"]): number {
  return m.engagement * 3 + (m.viewers || m.reach || 0) * 0.01;
}

/**
 * Compute derived rate metrics from FB-native fields.
 */
export function computeRates(m: PostHistoryEntry["metrics"]): {
  engagement_rate: number;
  comment_rate: number;
  hook_rate: number;
  rewatch_ratio: number;
  avg_watch_time_ms: number;
} {
  const v = m.viewers || m.reach || 1;
  const imp = m.impressions || 1;
  return {
    engagement_rate: m.engagement / v,
    comment_rate: m.comments / v,
    hook_rate: v / imp,
    rewatch_ratio: (m.views || m.video_views || 0) / v,
    avg_watch_time_ms: m.watch_time_ms / v,
  };
}

/**
 * Create a post with both engagement scores and rate metrics computed.
 */
export function makePostWithRates(overrides?: Partial<PostHistoryEntry>): PostHistoryEntry {
  const post = makePost(overrides);
  post.metrics.engagement_score = computeEngagement(post.metrics);
  const rates = computeRates(post.metrics);
  post.metrics.engagement_rate = rates.engagement_rate;
  post.metrics.comment_rate = rates.comment_rate;
  post.metrics.hook_rate = rates.hook_rate;
  post.metrics.rewatch_ratio = rates.rewatch_ratio;
  post.metrics.avg_watch_time_ms = rates.avg_watch_time_ms;
  return post;
}

/**
 * Create an array of posts with engagement scores and rates pre-computed.
 */
export function makePostsWithEngagement(
  count: number,
  factory: (i: number) => Partial<PostHistoryEntry>
): PostHistoryEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const post = makePost(factory(i));
    post.metrics.engagement_score = computeEngagement(post.metrics);
    const rates = computeRates(post.metrics);
    post.metrics.engagement_rate = rates.engagement_rate;
    post.metrics.comment_rate = rates.comment_rate;
    post.metrics.hook_rate = rates.hook_rate;
    post.metrics.rewatch_ratio = rates.rewatch_ratio;
    post.metrics.avg_watch_time_ms = rates.avg_watch_time_ms;
    return post;
  });
}
