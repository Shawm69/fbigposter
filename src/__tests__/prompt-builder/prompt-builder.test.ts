import {
  formatConstraints,
  formatBrandVoice,
  formatTactics,
  formatPillarPerformance,
  formatEngagementProfile,
  formatDistributionInsights,
  buildGenerationContext,
  formatRecentPosts,
  formatGenerationInsights,
  formatPillarRotation,
  formatCreativeExamples,
  formatExampleCaptions,
  formatNegativeGuidance,
  formatDurationPacing,
  formatPlatformTweaks,
} from "../../prompt-builder/index";
import {
  makeConstitution,
  makeSoul,
  makeTactics,
  makePost,
  makeGenerationLog,
  makeCreativeDirection,
} from "../fixtures";

describe("formatConstraints", () => {
  it("contains all banned topics", () => {
    const constitution = makeConstitution();
    const output = formatConstraints(constitution);
    for (const topic of constitution.banned_topics) {
      expect(output).toContain(topic);
    }
  });

  it("contains required disclosures", () => {
    const constitution = makeConstitution();
    const output = formatConstraints(constitution);
    for (const disc of constitution.content_policies.required_disclosures) {
      expect(output).toContain(disc);
    }
  });

  it("contains brand red lines", () => {
    const constitution = makeConstitution();
    const output = formatConstraints(constitution);
    for (const line of constitution.brand_red_lines) {
      expect(output).toContain(line);
    }
  });

  it("contains media generation rules section when present", () => {
    const constitution = makeConstitution();
    const output = formatConstraints(constitution);
    expect(output).toContain("AI Media Generation Rules");
    for (const rule of constitution.media_generation_rules) {
      expect(output).toContain(rule);
    }
  });

  it("omits media generation rules section when array is empty", () => {
    const constitution = makeConstitution({ media_generation_rules: [] });
    const output = formatConstraints(constitution);
    expect(output).not.toContain("AI Media Generation Rules");
  });

  it("omits media generation rules section when undefined", () => {
    const constitution = makeConstitution();
    (constitution as any).media_generation_rules = undefined;
    const output = formatConstraints(constitution);
    expect(output).not.toContain("AI Media Generation Rules");
  });
});

describe("formatBrandVoice", () => {
  const soul = makeSoul();

  it("contains tone", () => {
    const output = formatBrandVoice(soul);
    expect(output).toContain(soul.brand_voice.tone);
  });

  it("contains personality traits", () => {
    const output = formatBrandVoice(soul);
    for (const trait of soul.brand_voice.personality_traits) {
      expect(output).toContain(trait);
    }
  });

  it("contains writing style", () => {
    const output = formatBrandVoice(soul);
    expect(output).toContain(soul.brand_voice.writing_style);
  });

  it("contains audience demographic", () => {
    const output = formatBrandVoice(soul);
    expect(output).toContain(soul.audience.primary_demographic);
  });

  it("contains audience interests", () => {
    const output = formatBrandVoice(soul);
    for (const interest of soul.audience.interests) {
      expect(output).toContain(interest);
    }
  });

  it("contains audience pain points", () => {
    const output = formatBrandVoice(soul);
    for (const point of soul.audience.pain_points) {
      expect(output).toContain(point);
    }
  });

  it("contains visual identity info", () => {
    const output = formatBrandVoice(soul);
    expect(output).toContain(soul.visual_identity.preferred_aesthetics);
    expect(output).toContain(soul.visual_identity.logo_usage);
  });
});

describe("formatTactics", () => {
  it("contains visual style, caption patterns, hashtag strategy", () => {
    const tactics = makeTactics();
    const output = formatTactics(tactics);
    expect(output).toContain(tactics.visual_style.current_best);
    expect(output).toContain(tactics.visual_style.hook_style);
    expect(output).toContain(tactics.caption_patterns.cta_style);
    expect(output).toContain(String(tactics.hashtag_strategy.optimal_count));
  });

  it("includes recent learnings when present", () => {
    const tactics = makeTactics();
    const output = formatTactics(tactics);
    expect(output).toContain("Recent Learnings");
    expect(output).toContain("Morning posts perform 20% better");
  });

  it("handles empty learnings array", () => {
    const tactics = makeTactics({ learnings: [] });
    const output = formatTactics(tactics);
    expect(output).not.toContain("Recent Learnings");
  });
});

describe("buildGenerationContext", () => {
  const constitution = makeConstitution();
  const soul = makeSoul();
  const tactics = makeTactics();

  jest.mock("../../storage/files", () => ({
    readJSONL: jest.fn().mockReturnValue([]),
  }));

  it("returns correct pipeline_template for reels", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "reels");
    expect(ctx.pipeline_template).toContain("Reels Content Generation");
  });

  it("returns correct pipeline_template for image_posts", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "image_posts");
    expect(ctx.pipeline_template).toContain("Image Post Content Generation");
  });

  it("returns correct pipeline_template for stories", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "stories");
    expect(ctx.pipeline_template).toContain("Stories Content Generation");
  });

  it("throws for unknown pipeline", () => {
    expect(() =>
      buildGenerationContext(constitution, soul, tactics, "tiktok" as any)
    ).toThrow("Unknown pipeline");
  });

  it("template includes Constitution constraints", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "reels");
    for (const topic of constitution.banned_topics) {
      expect(ctx.pipeline_template).toContain(topic);
    }
  });

  it("template includes Soul voice info", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "reels");
    expect(ctx.pipeline_template).toContain(soul.brand_voice.tone);
  });

  it("template includes Tactics data", () => {
    const ctx = buildGenerationContext(constitution, soul, tactics, "reels");
    expect(ctx.pipeline_template).toContain(tactics.visual_style.current_best);
  });
});

describe("formatRecentPosts", () => {
  it("returns empty string for no posts", () => {
    expect(formatRecentPosts([])).toBe("");
  });

  it("formats recent posts with pillar and caption", () => {
    const posts = [
      makePost({ content_pillar: "Tips & Tricks", caption: "Quick tip for your morning" }),
      makePost({
        id: "post-002",
        content_pillar: "Community",
        caption: "What does your setup look like?",
        posted_at: "2026-01-16T09:00:00.000Z",
      }),
    ];
    const output = formatRecentPosts(posts);
    expect(output).toContain("Avoid Repetition");
    expect(output).toContain("Tips & Tricks");
    expect(output).toContain("Community");
    expect(output).toContain("Quick tip");
  });

  it("shows at most 5 posts", () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      makePost({ id: `post-${i}`, caption: `Caption ${i}` })
    );
    const output = formatRecentPosts(posts);
    expect(output).toContain("Caption 3");
    expect(output).toContain("Caption 7");
    expect(output).not.toContain("Caption 2");
  });
});

describe("formatPillarRotation", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatPillarRotation(soul, [])).toBe("");
  });

  it("returns empty string when content_pillars is empty", () => {
    const soul = makeSoul({ content_pillars: [] });
    expect(formatPillarRotation(soul, [])).toBe("");
  });

  it("recommends the most underrepresented pillar", () => {
    const soul = makeSoul();
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({ id: `post-${i}`, content_pillar: "Tips & Tricks" })
    );
    const output = formatPillarRotation(soul, posts);
    expect(output).toContain("Content Pillar Rotation");
    expect(output).toContain("Actual vs Target");
    expect(output).toMatch(/Recommended next pillar: (Behind the Scenes|Community)/);
  });

  it("surfaces content themes for the recommended pillar", () => {
    const soul = makeSoul();
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({ id: `post-${i}`, content_pillar: "Tips & Tricks" })
    );
    const output = formatPillarRotation(soul, posts);
    if (output.includes("Recommended next pillar: Behind the Scenes")) {
      expect(output).toContain("Day-in-the-life vlogs");
    }
  });
});

describe("formatCreativeExamples", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatCreativeExamples(soul, "sora")).toBe("");
  });

  it("returns empty string when no examples match tool type", () => {
    const soul = makeSoul({
      creative_direction: makeCreativeDirection({
        example_prompts: [
          { tool: "grok", prompt: "test", description: "test" },
        ],
      }),
    });
    expect(formatCreativeExamples(soul, "sora")).toBe("");
  });

  it("formats sora examples correctly", () => {
    const soul = makeSoul();
    const output = formatCreativeExamples(soul, "sora");
    expect(output).toContain("Example Sora Prompts");
    expect(output).toContain("sunrise timelapse");
    expect(output).toContain("cinematic feel");
  });

  it("formats grok examples correctly", () => {
    const soul = makeSoul();
    const output = formatCreativeExamples(soul, "grok");
    expect(output).toContain("Example Grok Prompts");
    expect(output).toContain("Flat-lay workspace");
    expect(output).toContain("productivity audience");
  });
});

describe("formatExampleCaptions", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatExampleCaptions(soul)).toBe("");
  });

  it("returns empty string when no example captions", () => {
    const soul = makeSoul({
      creative_direction: makeCreativeDirection({ example_captions: [] }),
    });
    expect(formatExampleCaptions(soul)).toBe("");
  });

  it("prefers pipeline-specific captions", () => {
    const soul = makeSoul();
    const output = formatExampleCaptions(soul, "reels");
    expect(output).toContain("Example Captions");
    expect(output).toContain("morning routine");
    expect(output).toContain("relatable hook");
  });

  it("falls back to general captions when no pipeline match", () => {
    const soul = makeSoul();
    const output = formatExampleCaptions(soul, "image_posts");
    expect(output).toContain("Example Captions");
    expect(output).toContain("productive day");
  });
});

describe("formatNegativeGuidance", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatNegativeGuidance(soul)).toBe("");
  });

  it("returns empty string when all avoid arrays are empty", () => {
    const soul = makeSoul({
      creative_direction: makeCreativeDirection({
        negative_guidance: {
          visual_avoid: [],
          caption_avoid: [],
          theme_avoid: [],
        },
      }),
    });
    expect(formatNegativeGuidance(soul)).toBe("");
  });

  it("formats all three sections when populated", () => {
    const soul = makeSoul();
    const output = formatNegativeGuidance(soul);
    expect(output).toContain("Negative Guidance");
    expect(output).toContain("Visual Avoid");
    expect(output).toContain("cluttered backgrounds");
    expect(output).toContain("Caption Avoid");
    expect(output).toContain("clickbait phrases");
    expect(output).toContain("Theme Avoid");
    expect(output).toContain("hustle culture");
  });

  it("omits empty sections", () => {
    const soul = makeSoul({
      creative_direction: makeCreativeDirection({
        negative_guidance: {
          visual_avoid: ["blurry images"],
          caption_avoid: [],
          theme_avoid: [],
        },
      }),
    });
    const output = formatNegativeGuidance(soul);
    expect(output).toContain("Visual Avoid");
    expect(output).not.toContain("Caption Avoid");
    expect(output).not.toContain("Theme Avoid");
  });
});

describe("formatDurationPacing", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatDurationPacing(soul)).toBe("");
  });

  it("formats duration and pacing correctly", () => {
    const soul = makeSoul();
    const output = formatDurationPacing(soul);
    expect(output).toContain("Video Duration & Pacing");
    expect(output).toContain("12 seconds");
    expect(output).toContain("fast cuts");
    expect(output).toContain("first 2 second(s)");
    expect(output).toContain("hook -> problem -> solution -> CTA");
  });
});

describe("formatPlatformTweaks", () => {
  it("returns empty string when creative_direction is undefined", () => {
    const soul = makeSoul({ creative_direction: undefined });
    expect(formatPlatformTweaks(soul, "reels")).toBe("");
  });

  it("shows reel_style for reels pipeline", () => {
    const soul = makeSoul();
    const output = formatPlatformTweaks(soul, "reels");
    expect(output).toContain("Platform-Specific Notes");
    expect(output).toContain("trending audio with original visuals");
    expect(output).not.toContain("Feed aesthetic");
  });

  it("shows story_style for stories pipeline", () => {
    const soul = makeSoul();
    const output = formatPlatformTweaks(soul, "stories");
    expect(output).toContain("casual polls and behind-the-scenes");
  });

  it("shows feed_aesthetic for image_posts pipeline", () => {
    const soul = makeSoul();
    const output = formatPlatformTweaks(soul, "image_posts");
    expect(output).toContain("cohesive warm-toned grid");
  });

  it("includes Facebook notes", () => {
    const soul = makeSoul();
    const output = formatPlatformTweaks(soul, "reels");
    expect(output).toContain("longer captions with storytelling");
    expect(output).toContain("older demographic");
  });
});

describe("formatPillarPerformance", () => {
  it("returns empty string when content_pillar_performance is empty", () => {
    const tactics = makeTactics({ content_pillar_performance: [] });
    expect(formatPillarPerformance(tactics, "reels")).toBe("");
  });

  it("returns empty string when content_pillar_performance is undefined", () => {
    const tactics = makeTactics();
    (tactics as any).content_pillar_performance = undefined;
    expect(formatPillarPerformance(tactics, "reels")).toBe("");
  });

  it("formats pillar performance with FB-native metrics and trends", () => {
    const tactics = makeTactics({
      content_pillar_performance: [
        {
          pillar: "Tips & Tricks",
          engagement_rate: 0.048,
          comment_rate: 0.012,
          avg_watch_time_ms: 13300,
          distribution_avg: 0.25,
          hook_rate: 0.7,
          post_count: 12,
          trend: "rising",
        },
        {
          pillar: "Behind the Scenes",
          engagement_rate: 0.02,
          comment_rate: 0.005,
          avg_watch_time_ms: 3400,
          distribution_avg: -0.3,
          hook_rate: 0.5,
          post_count: 6,
          trend: "declining",
        },
      ],
    });
    const output = formatPillarPerformance(tactics, "reels");
    expect(output).toContain("Content Pillar Performance");
    expect(output).toContain("Tips & Tricks");
    expect(output).toContain("Behind the Scenes");
    expect(output).toContain("avg watch");
    expect(output).toContain("distribution");
    expect(output).toContain("engagement");
    expect(output).toContain("trending: rising");
    expect(output).toContain("trending: declining");
    expect(output).toContain("Warning");
    expect(output).toContain("declining");
  });

  it("ranks by avg_watch_time_ms for reels", () => {
    const tactics = makeTactics({
      content_pillar_performance: [
        {
          pillar: "Low Watch",
          engagement_rate: 0.05,
          comment_rate: 0.01,
          avg_watch_time_ms: 3000,
          distribution_avg: 0.1,
          hook_rate: 0.7,
          post_count: 5,
          trend: "stable" as const,
        },
        {
          pillar: "High Watch",
          engagement_rate: 0.03,
          comment_rate: 0.01,
          avg_watch_time_ms: 15000,
          distribution_avg: 0.1,
          hook_rate: 0.7,
          post_count: 5,
          trend: "stable" as const,
        },
      ],
    });
    const output = formatPillarPerformance(tactics, "reels");
    // High Watch should be first (ranked by avg_watch_time_ms for reels)
    const highIdx = output.indexOf("High Watch");
    const lowIdx = output.indexOf("Low Watch");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("ranks by engagement_rate for image_posts", () => {
    const tactics = makeTactics({
      content_pillar_performance: [
        {
          pillar: "Low Engagement",
          engagement_rate: 0.01,
          comment_rate: 0.01,
          avg_watch_time_ms: 15000,
          distribution_avg: 0.1,
          hook_rate: 0.7,
          post_count: 5,
          trend: "stable" as const,
        },
        {
          pillar: "High Engagement",
          engagement_rate: 0.08,
          comment_rate: 0.01,
          avg_watch_time_ms: 3000,
          distribution_avg: 0.1,
          hook_rate: 0.7,
          post_count: 5,
          trend: "stable" as const,
        },
      ],
    });
    const output = formatPillarPerformance(tactics, "image_posts");
    const highIdx = output.indexOf("High Engagement");
    const lowIdx = output.indexOf("Low Engagement");
    expect(highIdx).toBeLessThan(lowIdx);
  });
});

describe("formatEngagementProfile", () => {
  it("returns empty string when engagement_rate_avg is 0", () => {
    const tactics = makeTactics();
    expect(formatEngagementProfile(tactics)).toBe("");
  });

  it("returns empty string when account_engagement_profile is undefined", () => {
    const tactics = makeTactics();
    (tactics as any).account_engagement_profile = undefined;
    expect(formatEngagementProfile(tactics)).toBe("");
  });

  it("formats engagement profile with FB-native metrics and strength", () => {
    const tactics = makeTactics({
      account_engagement_profile: {
        primary_strength: "retention",
        engagement_rate_avg: 0.048,
        comment_rate_avg: 0.009,
        avg_watch_time_ms: 7800,
        hook_rate_avg: 0.95,
        distribution_avg: 0.07,
        rewatch_ratio_avg: 1.3,
      },
    });
    const output = formatEngagementProfile(tactics);
    expect(output).toContain("Performance Profile");
    expect(output).toContain("Primary strength: retention");
    expect(output).toContain("watch time");
    expect(output).toContain("hook rate");
    expect(output).toContain("distribution");
    expect(output).toContain("engagement");
    expect(output).toContain("Focus on hooks");
  });

  it("shows correct advice for distribution strength", () => {
    const tactics = makeTactics({
      account_engagement_profile: {
        primary_strength: "distribution",
        engagement_rate_avg: 0.03,
        comment_rate_avg: 0.009,
        avg_watch_time_ms: 3000,
        hook_rate_avg: 0.6,
        distribution_avg: 0.2,
        rewatch_ratio_avg: 1.1,
      },
    });
    const output = formatEngagementProfile(tactics);
    expect(output).toContain("Primary strength: distribution");
    expect(output).toContain("algorithm likes your content");
  });
});

describe("formatDistributionInsights", () => {
  it("returns empty string when content_pillar_performance is empty", () => {
    const tactics = makeTactics({ content_pillar_performance: [] });
    expect(formatDistributionInsights(tactics)).toBe("");
  });

  it("returns empty string when no pillars have distribution data", () => {
    const tactics = makeTactics({
      content_pillar_performance: [
        {
          pillar: "Tips",
          engagement_rate: 0.05,
          comment_rate: 0.01,
          avg_watch_time_ms: 5000,
          distribution_avg: 0,
          hook_rate: 0.7,
          post_count: 5,
          trend: "stable" as const,
        },
      ],
    });
    expect(formatDistributionInsights(tactics)).toBe("");
  });

  it("formats distribution insights when data exists", () => {
    const tactics = makeTactics({
      content_pillar_performance: [
        {
          pillar: "Drama Twists",
          engagement_rate: 0.003,
          comment_rate: 0.001,
          avg_watch_time_ms: 13300,
          distribution_avg: 0.25,
          hook_rate: 0.7,
          post_count: 3,
          trend: "rising" as const,
        },
        {
          pillar: "Choice Posts",
          engagement_rate: 0.001,
          comment_rate: 0.0,
          avg_watch_time_ms: 3400,
          distribution_avg: -0.3,
          hook_rate: 0.5,
          post_count: 1,
          trend: "stable" as const,
        },
      ],
    });
    const output = formatDistributionInsights(tactics);
    expect(output).toContain("Distribution Insights");
    expect(output).toContain("Drama Twists");
    expect(output).toContain("+0.25x");
    expect(output).toContain("-0.30x");
    expect(output).toContain("algorithm favors");
  });
});

describe("formatRecentPosts with generation log data", () => {
  it("appends distribution score when available", () => {
    const posts = [
      makePost({
        metrics: { ...makePost().metrics, distribution: 0.25 },
      }),
    ];
    const output = formatRecentPosts(posts);
    expect(output).toContain("dist: +0.25x");
  });

  it("appends hook style when generation_log is present", () => {
    const posts = [
      makePost({
        generation_log: makeGenerationLog({
          tactics_snapshot: {
            ...makeGenerationLog().tactics_snapshot,
            hook_style: "question hook in first 2 seconds",
          },
        }),
      }),
    ];
    const output = formatRecentPosts(posts);
    expect(output).toContain("hook: question hook");
  });

  it("shows both distribution and hook style together", () => {
    const posts = [
      makePost({
        metrics: { ...makePost().metrics, distribution: -0.1 },
        generation_log: makeGenerationLog(),
      }),
    ];
    const output = formatRecentPosts(posts);
    expect(output).toContain("dist: -0.10x");
    expect(output).toContain("hook:");
  });
});

describe("formatGenerationInsights", () => {
  it("returns empty string with fewer than 3 posts with generation data", () => {
    const posts = [
      makePost({
        generation_log: makeGenerationLog(),
        metrics: { ...makePost().metrics, distribution: 0.3 },
      }),
    ];
    expect(formatGenerationInsights(posts, "reels")).toBe("");
  });

  it("returns empty string when posts lack generation logs", () => {
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({ id: `post-${i}` })
    );
    expect(formatGenerationInsights(posts, "reels")).toBe("");
  });

  it("returns empty string when posts lack distribution data", () => {
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        generation_log: makeGenerationLog(),
        metrics: { ...makePost().metrics, distribution: null },
      })
    );
    expect(formatGenerationInsights(posts, "reels")).toBe("");
  });

  it("formats top 3 posts by distribution with generation data", () => {
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        caption: `Test caption number ${i} with some content`,
        generation_log: makeGenerationLog({
          media_prompt: `A cinematic sunrise over cityscape take ${i}`,
          tactics_snapshot: {
            ...makeGenerationLog().tactics_snapshot,
            hook_style: "question hook",
            visual_style: "bold overlays",
          },
        }),
        metrics: {
          ...makePost().metrics,
          distribution: i * 0.1,
        },
      })
    );

    const output = formatGenerationInsights(posts, "reels");
    expect(output).toContain("What Worked");
    expect(output).toContain("Generation Insights");
    expect(output).toContain("distribution");
    expect(output).toContain("Hook: question hook");
    expect(output).toContain("Visual: bold overlays");
    expect(output).toContain("Media prompt:");
    expect(output).toContain("Caption length:");
  });

  it("truncates media prompts longer than 150 chars", () => {
    const longPrompt = "A".repeat(200);
    const posts = Array.from({ length: 3 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        generation_log: makeGenerationLog({ media_prompt: longPrompt }),
        metrics: { ...makePost().metrics, distribution: 0.3 },
      })
    );

    const output = formatGenerationInsights(posts, "reels");
    expect(output).toContain("...");
    expect(output).not.toContain("A".repeat(200));
  });
});
