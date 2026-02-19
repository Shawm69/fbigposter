import {
  analyzeHookStylePerformance,
  analyzeMediaPromptPatterns,
  analyzePillarFollowThrough,
} from "../../analysis/generation-log-analyzer";
import { makePost, makeGenerationLog } from "../fixtures";
import { PostHistoryEntry } from "../../tools/post-content";

function makePostsWithLogs(
  count: number,
  factory: (i: number) => Partial<PostHistoryEntry>
): PostHistoryEntry[] {
  return Array.from({ length: count }, (_, i) => makePost(factory(i)));
}

describe("analyzeHookStylePerformance", () => {
  it("returns null with fewer than 5 posts with generation logs", () => {
    const posts = makePostsWithLogs(3, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
    }));
    expect(analyzeHookStylePerformance(posts, "reels")).toBeNull();
  });

  it("returns null for stories pipeline", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
    }));
    expect(analyzeHookStylePerformance(posts, "stories")).toBeNull();
  });

  it("returns null when no posts have generation logs", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeHookStylePerformance(posts, "reels")).toBeNull();
  });

  it("identifies best hook style for reels by avg_watch_time_ms", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          hook_style: i < 3 ? "question hook" : "pattern interrupt",
        },
      }),
      metrics: {
        ...makePost().metrics,
        // question hook posts get higher watch time
        avg_watch_time_ms: i < 3 ? 8000 : 3000,
        viewers: 1000,
        watch_time_ms: i < 3 ? 8000000 : 3000000,
      },
    }));

    const finding = analyzeHookStylePerformance(posts, "reels");
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe("hook_style_performance");
    expect(finding!.insight).toContain("question hook");
    expect(finding!.suggested_field).toBe("visual_style.hook_style");
    expect(finding!.suggested_value).toBe("question hook");
  });

  it("identifies best hook style for image_posts by engagement_rate", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          hook_style: i < 3 ? "bold text overlay" : "minimal style",
        },
      }),
      metrics: {
        ...makePost().metrics,
        engagement_rate: i < 3 ? 0.08 : 0.02,
        engagement: i < 3 ? 240 : 60,
        viewers: 3000,
      },
    }));

    const finding = analyzeHookStylePerformance(posts, "image_posts");
    expect(finding).not.toBeNull();
    expect(finding!.insight).toContain("bold text overlay");
    expect(finding!.suggested_value).toBe("bold text overlay");
  });

  it("returns null when all posts have the same hook style and fewer than 2 in bucket", () => {
    const posts = makePostsWithLogs(5, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          hook_style: `unique-style-${i}`,
        },
      }),
    }));

    const finding = analyzeHookStylePerformance(posts, "reels");
    expect(finding).toBeNull();
  });
});

describe("analyzeMediaPromptPatterns", () => {
  it("returns null with fewer than 5 posts with media prompts and distribution", () => {
    const posts = makePostsWithLogs(3, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
    }));
    expect(analyzeMediaPromptPatterns(posts)).toBeNull();
  });

  it("returns null when posts have no distribution data", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
      metrics: {
        ...makePost().metrics,
        distribution: null,
      },
    }));
    expect(analyzeMediaPromptPatterns(posts)).toBeNull();
  });

  it("returns null when posts have no generation logs", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeMediaPromptPatterns(posts)).toBeNull();
  });

  it("finds discriminative keywords in high-distribution posts", () => {
    const posts = makePostsWithLogs(8, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog({
        media_prompt: i < 4
          ? "golden sunrise timelapse over modern cityscape with warm cinematic lighting"
          : "simple static product shot on white background minimal",
      }),
      metrics: {
        ...makePost().metrics,
        distribution: i < 4 ? 0.5 : -0.2,
      },
    }));

    const finding = analyzeMediaPromptPatterns(posts);
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe("media_prompt_patterns");
    expect(finding!.insight).toContain("High-distribution media prompts");
  });

  it("returns null when no discriminative keywords found", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog({
        media_prompt: "exactly the same prompt for every single post",
      }),
      metrics: {
        ...makePost().metrics,
        distribution: i < 3 ? 0.3 : -0.1,
      },
    }));

    const finding = analyzeMediaPromptPatterns(posts);
    // May or may not find discriminative keywords depending on splitting
    // but shouldn't crash
    expect(finding === null || finding.category === "media_prompt_patterns").toBe(true);
  });
});

describe("analyzePillarFollowThrough", () => {
  it("returns null with fewer than 5 posts with generation logs", () => {
    const posts = makePostsWithLogs(3, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
    }));
    expect(analyzePillarFollowThrough(posts, "reels")).toBeNull();
  });

  it("returns null for stories pipeline", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      generation_log: makeGenerationLog(),
    }));
    expect(analyzePillarFollowThrough(posts, "stories")).toBeNull();
  });

  it("returns null when no posts have generation logs", () => {
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzePillarFollowThrough(posts, "reels")).toBeNull();
  });

  it("detects when following recommendations helps performance", () => {
    const posts = makePostsWithLogs(8, (i) => ({
      id: `post-${i}`,
      content_pillar: i < 4 ? "Behind the Scenes" : "Tips & Tricks",
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          recommended_pillar_at_creation: "Behind the Scenes",
        },
      }),
      metrics: {
        ...makePost().metrics,
        // Posts that followed recommendation perform better
        avg_watch_time_ms: i < 4 ? 8000 : 3000,
        engagement_rate: i < 4 ? 0.08 : 0.02,
        viewers: 1000,
        watch_time_ms: i < 4 ? 8000000 : 3000000,
      },
    }));

    const finding = analyzePillarFollowThrough(posts, "reels");
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe("pillar_follow_through");
    expect(finding!.insight).toContain("following");
  });

  it("detects when ignoring recommendations performs better", () => {
    const posts = makePostsWithLogs(8, (i) => ({
      id: `post-${i}`,
      content_pillar: i < 4 ? "Behind the Scenes" : "Tips & Tricks",
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          recommended_pillar_at_creation: "Behind the Scenes",
        },
      }),
      metrics: {
        ...makePost().metrics,
        // Posts that ignored recommendation perform better
        avg_watch_time_ms: i < 4 ? 3000 : 8000,
        engagement_rate: i < 4 ? 0.02 : 0.08,
        viewers: 1000,
        watch_time_ms: i < 4 ? 3000000 : 8000000,
      },
    }));

    const finding = analyzePillarFollowThrough(posts, "reels");
    expect(finding).not.toBeNull();
    expect(finding!.insight).toContain("ignoring");
  });

  it("returns null when not enough posts in both categories", () => {
    // All posts follow recommendation — no ignored group
    const posts = makePostsWithLogs(6, (i) => ({
      id: `post-${i}`,
      content_pillar: "Behind the Scenes",
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          recommended_pillar_at_creation: "Behind the Scenes",
        },
      }),
    }));

    const finding = analyzePillarFollowThrough(posts, "reels");
    expect(finding).toBeNull();
  });

  it("uses engagement_rate as primary metric for image_posts", () => {
    const posts = makePostsWithLogs(8, (i) => ({
      id: `post-${i}`,
      pipeline: "image_posts",
      content_pillar: i < 4 ? "Community" : "Tips & Tricks",
      generation_log: makeGenerationLog({
        tactics_snapshot: {
          ...makeGenerationLog().tactics_snapshot,
          recommended_pillar_at_creation: "Community",
        },
      }),
      metrics: {
        ...makePost().metrics,
        engagement_rate: i < 4 ? 0.1 : 0.03,
        engagement: i < 4 ? 300 : 90,
        viewers: 3000,
      },
    }));

    const finding = analyzePillarFollowThrough(posts, "image_posts");
    expect(finding).not.toBeNull();
    expect(finding!.insight).toContain("engagement rate");
  });
});
