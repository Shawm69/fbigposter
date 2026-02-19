import {
  analyzePostingTimes,
  analyzeCaptionLength,
  analyzeHashtags,
  analyzeVersionTrends,
  analyzeContentPillars,
  analyzeEngagementProfile,
  analyzeDistribution,
  analyzeHookQuality,
} from "../../analysis/analyzer";
import { makePost, makePostsWithEngagement, makeTactics } from "../fixtures";

describe("analyzePostingTimes", () => {
  it("returns null when fewer than 5 posts", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-15T09:00:00.000Z`,
    }));
    expect(analyzePostingTimes(posts)).toBeNull();
  });

  it("returns null when fewer than 2 significant hours", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
    }));
    expect(analyzePostingTimes(posts)).toBeNull();
  });

  it("identifies best posting hours by viewers", () => {
    const highHourUTC = "09:00:00.000Z";
    const lowHourUTC = "15:00:00.000Z";
    const expectedHighLocal = new Date(`2026-01-15T${highHourUTC}`).getHours();
    const expectedHighStr = `${String(expectedHighLocal).padStart(2, "0")}:00`;

    const posts = makePostsWithEngagement(6, (i) => {
      const isHigh = i < 3;
      return {
        id: `post-${i}`,
        posted_at: isHigh
          ? `2026-01-${15 + i}T${highHourUTC}`
          : `2026-01-${15 + i}T${lowHourUTC}`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isHigh ? 5000 : 1000,
          engagement: isHigh ? 360 : 57,
          comments: isHigh ? 40 : 5,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isHigh ? 5000 : 1000,
          likes: isHigh ? 300 : 50,
          shares: isHigh ? 20 : 2,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzePostingTimes(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("posting_times");
    expect(result!.suggested_value).toContain(expectedHighStr);
    expect(result!.evidence).toContain("viewers");
  });

  it("confidence scales with post count capped at 0.9", () => {
    const posts = makePostsWithEngagement(50, (i) => ({
      id: `post-${i}`,
      posted_at: i % 2 === 0
        ? `2026-01-${String((i % 28) + 1).padStart(2, "0")}T09:00:00.000Z`
        : `2026-01-${String((i % 28) + 1).padStart(2, "0")}T18:00:00.000Z`,
    }));
    const result = analyzePostingTimes(posts);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThanOrEqual(0.9);
  });
});

describe("analyzeCaptionLength", () => {
  it("returns null when fewer than 5 posts", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      caption: "Short",
    }));
    expect(analyzeCaptionLength(posts)).toBeNull();
  });

  it("correctly identifies best caption length range by engagement rate", () => {
    const posts = makePostsWithEngagement(6, (i) => {
      const isMedium = i < 3;
      return {
        id: `post-${i}`,
        caption: isMedium ? "A".repeat(150) : "B".repeat(50),
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isMedium ? 5000 : 1000,
          engagement: isMedium ? 500 : 20,
          comments: isMedium ? 40 : 5,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isMedium ? 5000 : 1000,
          likes: isMedium ? 300 : 50,
          shares: isMedium ? 20 : 2,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzeCaptionLength(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("caption_length");
    expect(result!.insight).toContain("medium");
    // Should mention engagement rate, not engagement score
    expect(result!.evidence).toContain("engagement rate");
  });

  it("handles all posts in same bucket", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      caption: "A".repeat(150),
      posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
    }));
    const result = analyzeCaptionLength(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("caption_length");
  });
});

describe("analyzeHashtags", () => {
  it("returns empty array when fewer than 5 posts", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      hashtags: ["#fitness"],
    }));
    expect(analyzeHashtags(posts)).toEqual([]);
  });

  it("identifies optimal hashtag count by viewers", () => {
    const posts = makePostsWithEngagement(8, (i) => {
      const isFew = i < 4;
      return {
        id: `post-${i}`,
        hashtags: isFew
          ? ["#a", "#b", "#c", "#d", "#e"]
          : Array.from({ length: 15 }, (_, j) => `#tag${j}`),
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isFew ? 5000 : 1000,
          engagement: isFew ? 300 : 50,
          comments: isFew ? 40 : 5,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isFew ? 5000 : 1000,
          likes: isFew ? 300 : 50,
          shares: isFew ? 20 : 2,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const results = analyzeHashtags(posts);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const countFinding = results.find((f) => f.category === "hashtags");
    expect(countFinding).toBeDefined();
    expect(countFinding!.suggested_value).toBe(5);
    // Evidence should mention viewers, not engagement
    expect(countFinding!.evidence).toContain("viewers");
  });

  it("returns top performing hashtags finding", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      hashtags: ["#always", "#sometimes"],
      posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
    }));
    const results = analyzeHashtags(posts);
    const topFinding = results.find((f) => f.category === "hashtags_top");
    expect(topFinding).toBeDefined();
    expect(topFinding!.suggested_field).toBe("hashtag_strategy.top_performing");
    expect(topFinding!.suggested_value).toContain("#always");
  });
});

describe("analyzeVersionTrends", () => {
  const tactics = makeTactics();

  it("returns null when fewer than 10 posts", () => {
    const posts = makePostsWithEngagement(8, (i) => ({
      id: `post-${i}`,
      tactics_version_used: i < 4 ? 1 : 2,
    }));
    expect(analyzeVersionTrends(posts, tactics)).toBeNull();
  });

  it("returns null when only 1 tactics version", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      tactics_version_used: 1,
      posted_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    expect(analyzeVersionTrends(posts, tactics)).toBeNull();
  });

  it("detects improvement trend", () => {
    const posts = makePostsWithEngagement(12, (i) => {
      const isV2 = i >= 6;
      return {
        id: `post-${i}`,
        tactics_version_used: isV2 ? 2 : 1,
        posted_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isV2 ? 5000 : 2000,
          engagement: isV2 ? 500 : 100,
          comments: isV2 ? 40 : 10,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isV2 ? 5000 : 2000,
          likes: isV2 ? 300 : 100,
          shares: isV2 ? 20 : 5,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzeVersionTrends(posts, tactics);
    expect(result).not.toBeNull();
    expect(result!.insight).toContain("improved");
  });

  it("detects decline trend", () => {
    const posts = makePostsWithEngagement(12, (i) => {
      const isV2 = i >= 6;
      return {
        id: `post-${i}`,
        tactics_version_used: isV2 ? 2 : 1,
        posted_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isV2 ? 1000 : 5000,
          engagement: isV2 ? 20 : 500,
          comments: isV2 ? 5 : 40,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isV2 ? 1000 : 5000,
          likes: isV2 ? 50 : 300,
          shares: isV2 ? 2 : 20,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzeVersionTrends(posts, tactics);
    expect(result).not.toBeNull();
    expect(result!.insight).toContain("declined");
  });
});

describe("analyzeContentPillars", () => {
  it("returns null when fewer than 10 posts", () => {
    const posts = makePostsWithEngagement(5, (i) => ({
      id: `post-${i}`,
      content_pillar: "Tips & Tricks",
    }));
    expect(analyzeContentPillars(posts, "image_posts")).toBeNull();
  });

  it("returns null when no pillar has 3+ posts", () => {
    const pillars = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    const posts = makePostsWithEngagement(10, (i) => ({
      id: `post-${i}`,
      content_pillar: pillars[i],
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    expect(analyzeContentPillars(posts, "image_posts")).toBeNull();
  });

  it("returns null for stories pipeline", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      content_pillar: i < 6 ? "Tips & Tricks" : "Behind the Scenes",
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    expect(analyzeContentPillars(posts, "stories")).toBeNull();
  });

  it("ranks pillars by engagement_rate for image_posts", () => {
    const posts = makePostsWithEngagement(12, (i) => {
      const isTips = i < 6;
      return {
        id: `post-${i}`,
        content_pillar: isTips ? "Tips & Tricks" : "Behind the Scenes",
        posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: 3000,
          engagement: isTips ? 300 : 30,
          comments: 30,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 20000,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: 3000,
          likes: 200,
          shares: 10,
          saves: 0,
          video_views: 0,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzeContentPillars(posts, "image_posts");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("content_pillars");
    // Tips & Tricks should be ranked first (higher engagement)
    expect(result!.suggested_value[0].pillar).toBe("Tips & Tricks");
    expect(result!.insight).toContain("Tips & Tricks");
  });

  it("ranks pillars by avg_watch_time_ms for reels", () => {
    const posts = makePostsWithEngagement(12, (i) => {
      const isTips = i < 6;
      return {
        id: `post-${i}`,
        content_pillar: isTips ? "Tips & Tricks" : "Community",
        posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: 3000,
          engagement: 200,
          comments: 30,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: isTips ? 15000 : 45000, // Community has more watch time
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: 3000,
          likes: 200,
          shares: 10,
          saves: 0,
          video_views: 4000,
          completion_rate: 0,
          profile_visits: 0,
          engagement_score: 0,
          save_rate: 0,
          share_rate: 0,
        },
      };
    });
    const result = analyzeContentPillars(posts, "reels");
    expect(result).not.toBeNull();
    // Community should be ranked first (higher avg_watch_time_ms)
    expect(result!.suggested_value[0].pillar).toBe("Community");
  });

  it("detects declining trend when second half drops 20%+", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      content_pillar: "Tips & Tricks",
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000,
        engagement: i < 6 ? 300 : 30,
        comments: 30,
        net_follows: 3,
        impressions: 5000,
        distribution: 0.1,
        watch_time_ms: 20000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 200,
        shares: 10,
        saves: 0,
        video_views: 0,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeContentPillars(posts, "image_posts");
    expect(result).not.toBeNull();
    const tipsPerf = result!.suggested_value.find(
      (p: any) => p.pillar === "Tips & Tricks"
    );
    expect(tipsPerf.trend).toBe("declining");
  });
});

describe("analyzeEngagementProfile", () => {
  it("returns null when fewer than 10 posts", () => {
    const posts = makePostsWithEngagement(5, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeEngagementProfile(posts)).toBeNull();
  });

  it("detects retention as primary strength when avg_watch_time_ms > 5000", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000,
        engagement: 100,
        comments: 10,
        net_follows: 3,
        impressions: 5000,
        distribution: -0.1,
        watch_time_ms: 18000000, // 6000ms avg per viewer → > 5000ms threshold
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 50,
        shares: 5,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeEngagementProfile(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("engagement_profile");
    expect(result!.suggested_value.primary_strength).toBe("retention");
  });

  it("detects hooks as primary strength when hook_rate > 0.9", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 4800, // hook_rate = 4800/5000 = 0.96
        engagement: 100,
        comments: 10,
        net_follows: 3,
        impressions: 5000,
        distribution: -0.1,
        watch_time_ms: 5000, // low watch time, avg 1.04s
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 4800,
        likes: 50,
        shares: 5,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeEngagementProfile(posts);
    expect(result).not.toBeNull();
    expect(result!.suggested_value.primary_strength).toBe("hooks");
  });

  it("detects distribution as primary strength when distribution_avg > 0", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000, // hook_rate = 3000/5000 = 0.6
        engagement: 100,
        comments: 10,
        net_follows: 3,
        impressions: 5000,
        distribution: 0.3, // positive distribution
        watch_time_ms: 5000, // avg 1.67s, below 5s
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 50,
        shares: 5,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeEngagementProfile(posts);
    expect(result).not.toBeNull();
    expect(result!.suggested_value.primary_strength).toBe("distribution");
  });

  it("includes FB-native metrics in the profile", () => {
    const posts = makePostsWithEngagement(12, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 1000,
        engagement: 110,
        comments: 20,
        net_follows: 3,
        impressions: 5000,
        distribution: 0.05,
        watch_time_ms: 3000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 1000,
        likes: 50,
        shares: 10,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeEngagementProfile(posts);
    expect(result).not.toBeNull();
    const profile = result!.suggested_value;
    expect(profile.engagement_rate_avg).toBeGreaterThan(0);
    expect(profile.comment_rate_avg).toBeGreaterThan(0);
    expect(profile.hook_rate_avg).toBeGreaterThan(0);
    expect(profile.avg_watch_time_ms).toBeGreaterThan(0);
    expect(profile.distribution_avg).toBeCloseTo(0.05, 2);
    expect(profile.rewatch_ratio_avg).toBeGreaterThan(0);
  });
});

describe("analyzeDistribution", () => {
  it("returns null when fewer than 5 posts with distribution", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000,
        engagement: 200,
        comments: 30,
        net_follows: 3,
        impressions: 5000,
        distribution: 0.1,
        watch_time_ms: 20000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 200,
        shares: 10,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    expect(analyzeDistribution(posts)).toBeNull();
  });

  it("returns null when all distribution values are null", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000,
        engagement: 200,
        comments: 30,
        net_follows: 3,
        impressions: 5000,
        distribution: null,
        watch_time_ms: 20000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 200,
        shares: 10,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    expect(analyzeDistribution(posts)).toBeNull();
  });

  it("analyzes distribution correlations when data exists", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T${i < 3 ? "09" : "18"}:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: 3000,
        engagement: 200,
        comments: 30,
        net_follows: 3,
        impressions: 5000,
        distribution: i < 3 ? 0.3 : -0.2,
        watch_time_ms: i < 3 ? 30000 : 10000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 200,
        shares: 10,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeDistribution(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("distribution");
    expect(result!.insight).toContain("distribution");
  });
});

describe("analyzeHookQuality", () => {
  it("returns null when fewer than 5 posts with impressions", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeHookQuality(posts)).toBeNull();
  });

  it("analyzes hook rate quality", () => {
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      caption: i < 3 ? "Short hook" : "A".repeat(200),
      posted_at: `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 4000,
        viewers: i < 3 ? 4500 : 1000,
        engagement: 200,
        comments: 30,
        net_follows: 3,
        impressions: 5000,
        distribution: 0.1,
        watch_time_ms: 20000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: i < 3 ? 4500 : 1000,
        likes: 200,
        shares: 10,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeHookQuality(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("hook_quality");
    expect(result!.insight).toContain("hook rate");
  });
});
