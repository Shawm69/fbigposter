import { analyzeReelRetention, analyzeReelViewPatterns } from "../../analysis/reels-analyzer";
import { analyzeImageEngagement, analyzeImageHashtagImpact } from "../../analysis/image-posts-analyzer";
import { analyzeStoryImpressions, analyzeStoryRetention } from "../../analysis/stories-analyzer";
import { makePostsWithEngagement } from "../fixtures";

// ── Reels Analyzer ──

describe("analyzeReelRetention", () => {
  it("returns null with insufficient data", () => {
    const posts = makePostsWithEngagement(2, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeReelRetention(posts)).toBeNull();
  });

  it("returns null when no posts have watch_time_ms > 0", () => {
    const posts = makePostsWithEngagement(5, (i) => ({
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
        watch_time_ms: 0, // no watch time
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 3000,
        likes: 200,
        shares: 15,
        saves: 0,
        video_views: 4000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    expect(analyzeReelRetention(posts)).toBeNull();
  });

  it("identifies retention-engagement correlation", () => {
    const posts = makePostsWithEngagement(6, (i) => {
      const isHigh = i < 3;
      return {
        id: `post-${i}`,
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 4000,
          viewers: isHigh ? 5000 : 1000,
          engagement: isHigh ? 500 : 20,
          comments: isHigh ? 50 : 5,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: isHigh ? 50000 : 5000, // high retention vs low
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isHigh ? 5000 : 1000,
          likes: isHigh ? 400 : 50,
          shares: isHigh ? 25 : 2,
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
    const result = analyzeReelRetention(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("reel_retention");
    expect(result!.insight).toContain("engagement");
  });
});

describe("analyzeReelViewPatterns", () => {
  it("returns null with fewer than 5 posts with viewers", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
    }));
    expect(analyzeReelViewPatterns(posts)).toBeNull();
  });

  it("identifies strongest interaction type", () => {
    // Posts where comments are disproportionately high
    const posts = makePostsWithEngagement(6, (i) => ({
      id: `post-${i}`,
      posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
      metrics: {
        collected_at: "2026-01-20T00:00:00.000Z",
        views: 10000,
        viewers: 5000,
        engagement: 600, // high total
        comments: 500, // mostly comments
        net_follows: 3,
        impressions: 10000,
        distribution: 0.1,
        watch_time_ms: 20000,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 5000,
        likes: 100,
        shares: 10,
        saves: 0,
        video_views: 10000,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
    }));
    const result = analyzeReelViewPatterns(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("reel_view_patterns");
    expect(result!.insight).toContain("comments");
  });
});

// ── Image Posts Analyzer ──

describe("analyzeImageEngagement", () => {
  it("returns null with fewer than 5 posts", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      pipeline: "image_posts",
    }));
    expect(analyzeImageEngagement(posts)).toBeNull();
  });

  it("correlates engagement rate with caption length", () => {
    const posts = makePostsWithEngagement(8, (i) => {
      const isHighEng = i < 4;
      return {
        id: `post-${i}`,
        pipeline: "image_posts",
        caption: isHighEng ? "A".repeat(200) : "B".repeat(50),
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 0,
          viewers: 3000,
          engagement: isHighEng ? 300 : 10,
          comments: 30,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 0,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: 3000,
          likes: 200,
          shares: 15,
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
    const result = analyzeImageEngagement(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("image_engagement");
    expect(result!.insight).toContain("longer");
  });

  it("includes top engagement pillar in insight", () => {
    const posts = makePostsWithEngagement(8, (i) => {
      const isTips = i < 4;
      return {
        id: `post-${i}`,
        pipeline: "image_posts",
        content_pillar: isTips ? "Tips & Tricks" : "Community",
        caption: isTips ? "A".repeat(200) : "B".repeat(50),
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 0,
          viewers: 3000,
          engagement: isTips ? 300 : 10,
          comments: 30,
          net_follows: 3,
          impressions: 5000,
          distribution: 0.1,
          watch_time_ms: 0,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: 3000,
          likes: 200,
          shares: 15,
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
    const result = analyzeImageEngagement(posts);
    expect(result).not.toBeNull();
    expect(result!.insight).toContain("Tips & Tricks");
  });
});

describe("analyzeImageHashtagImpact", () => {
  it("returns null with fewer than 5 posts", () => {
    const posts = makePostsWithEngagement(3, (i) => ({
      id: `post-${i}`,
      pipeline: "image_posts",
    }));
    expect(analyzeImageHashtagImpact(posts)).toBeNull();
  });

  it("finds best hashtag count range by viewers", () => {
    const posts = makePostsWithEngagement(8, (i) => {
      const isMidRange = i < 4;
      return {
        id: `post-${i}`,
        pipeline: "image_posts",
        hashtags: isMidRange
          ? ["#a", "#b", "#c", "#d", "#e", "#f", "#g"]
          : ["#x", "#y"],
        posted_at: `2026-01-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`,
        metrics: {
          collected_at: "2026-01-20T00:00:00.000Z",
          views: 0,
          viewers: isMidRange ? 8000 : 1000,
          engagement: 200,
          comments: 30,
          net_follows: 3,
          impressions: isMidRange ? 10000 : 2000,
          distribution: 0.1,
          watch_time_ms: 0,
          engagement_rate: 0,
          comment_rate: 0,
          hook_rate: 0,
          rewatch_ratio: 0,
          avg_watch_time_ms: 0,
          reach: isMidRange ? 8000 : 1000,
          likes: 200,
          shares: 15,
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
    const result = analyzeImageHashtagImpact(posts);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("image_hashtag_impact");
    expect(result!.insight).toContain("6-10");
  });
});

// ── Stories Analyzer ──

describe("analyzeStoryImpressions", () => {
  it("returns null (story analysis paused)", () => {
    const posts = makePostsWithEngagement(8, (i) => ({
      id: `post-${i}`,
      pipeline: "stories",
    }));
    expect(analyzeStoryImpressions(posts)).toBeNull();
  });
});

describe("analyzeStoryRetention", () => {
  it("returns null (story analysis paused)", () => {
    const posts = makePostsWithEngagement(8, (i) => ({
      id: `post-${i}`,
      pipeline: "stories",
    }));
    expect(analyzeStoryRetention(posts)).toBeNull();
  });
});
