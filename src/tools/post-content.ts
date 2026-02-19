import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import { loadConstitution, validateAgainstConstitution, checkDailyLimit } from "../tiers/constitution";
import { loadTactics } from "../tiers/tactics";
import { loadSoul } from "../tiers/soul";
import { postToFacebook } from "../meta-api/facebook";
import { postToInstagram } from "../meta-api/instagram";
import { isLocalPath, uploadLocalFile } from "../meta-api/upload";
import { appendJSONL, readJSONL, moveFile, fileExists } from "../storage/files";
import { postsHistoryPath, stagingDir, archiveDir, Pipeline } from "../storage/paths";
import { PluginConfig } from "../../config-schema";

export interface GenerationLog {
  media_prompt: string;
  pipeline_template: string;
  post_type: "feed" | "reel" | "story";
  tactics_snapshot: {
    hook_style: string;
    visual_style: string;
    color_trends: string;
    cta_style: string;
    emoji_usage: string;
    optimal_length_chars: number;
    optimal_hashtag_count: number;
    top_pillar_at_creation: string;
    recommended_pillar_at_creation: string;
  };
}

export interface PostContentParams {
  pipeline: Pipeline;
  media_path: string;
  caption: string;
  hashtags: string[];
  post_type: "feed" | "reel" | "story";
  content_pillar?: string;
  media_prompt?: string;
  pipeline_template?: string;
}

export interface PostContentResult {
  success: boolean;
  ig_post_id?: string;
  fb_post_id?: string;
  ig_url?: string;
  fb_url?: string;
  error?: string;
  violations?: string[];
}

export interface PostHistoryEntry {
  id: string;
  pipeline: string;
  platform: string;
  created_at: string;
  posted_at: string;
  post_type: string;
  caption: string;
  hashtags: string[];
  media_path: string;
  platform_post_id: string;
  content_pillar: string;
  tactics_version_used: number;
  soul_version_used: number;
  generation_log?: GenerationLog;
  metrics: {
    collected_at: string;
    // Raw from FB scrape
    views: number;
    viewers: number;
    engagement: number;
    comments: number;
    net_follows: number;
    impressions: number;
    distribution: number | null;
    watch_time_ms: number;
    // Derived (computed on collection)
    engagement_rate: number;
    comment_rate: number;
    hook_rate: number;
    rewatch_ratio: number;
    avg_watch_time_ms: number;
    // Legacy (kept for old data, default 0)
    reach: number;
    likes: number;
    shares: number;
    saves: number;
    video_views: number;
    completion_rate: number;
    profile_visits: number;
    engagement_score: number;
    save_rate: number;
    share_rate: number;
  };
  metrics_harvests: number;
  metrics_complete: boolean;
}

/**
 * Tool: smi_post_content
 *
 * Publishes content to both Facebook and Instagram via Meta Graph API.
 * Validates against Constitution, uploads media, logs to history.
 */
export async function postContentTool(
  params: PostContentParams,
  config: PluginConfig
): Promise<PostContentResult> {
  try {
    const { pipeline, media_path, caption, hashtags, post_type } = params;

    // 1. Validate against Constitution
    const constitution = loadConstitution();
    const fullCaption = caption + " " + hashtags.join(" ");
    const violations = validateAgainstConstitution(constitution, {
      caption: fullCaption,
      hashtags,
      pipeline,
    });

    if (violations.length > 0) {
      return {
        success: false,
        error: "Content violates Constitution rules",
        violations,
      };
    }

    // 2. Check daily posting limits
    const todayStr = new Date().toISOString().split("T")[0];
    const history = readJSONL<PostHistoryEntry>(postsHistoryPath());
    const todayPosts = history.filter(
      (p) => p.pipeline === pipeline && p.posted_at.startsWith(todayStr)
    );

    if (!checkDailyLimit(constitution, pipeline, todayPosts.length)) {
      return {
        success: false,
        error: `Daily posting limit reached for ${pipeline} (max: ${constitution.content_policies.max_posts_per_day[pipeline]})`,
      };
    }

    // 3. Verify media file exists
    if (!fileExists(media_path)) {
      return {
        success: false,
        error: `Media file not found: ${media_path}`,
      };
    }

    // 4. Determine if video
    const ext = path.extname(media_path).toLowerCase();
    const isVideo = [".mp4", ".mov", ".avi", ".webm"].includes(ext);

    // 5. Build full caption with hashtags
    const hashtagStr = hashtags.join(" ");
    const postCaption = `${caption}\n\n${hashtagStr}`;

    // 5b. Resolve media URL — upload local files via Meta Resumable Upload API
    let mediaUrl: string;
    if (isLocalPath(media_path)) {
      try {
        mediaUrl = await uploadLocalFile(config.meta.app_id, media_path);
      } catch (uploadErr: any) {
        return {
          success: false,
          error: `Media upload failed: ${uploadErr.message}`,
        };
      }
    } else {
      mediaUrl = media_path;
    }

    // 6. Post to Instagram
    let igResult;
    try {
      igResult = await postToInstagram(
        config.meta.ig_user_id,
        post_type,
        mediaUrl,
        postCaption,
        isVideo,
        config.meta.app_id
      );
    } catch (err: any) {
      igResult = { post_id: "", url: "", error: err.message };
    }

    // 7. Post to Facebook
    let fbResult;
    try {
      fbResult = await postToFacebook(
        config.meta.page_id,
        post_type,
        mediaUrl,
        postCaption,
        isVideo,
        config.meta.app_id
      );
    } catch (err: any) {
      fbResult = { post_id: "", url: "", error: err.message };
    }

    // 8. Load current versions for tracking
    const tactics = loadTactics(pipeline);
    const soul = loadSoul();

    // 8b. Build generation log if agent provided media_prompt or pipeline_template
    let generationLog: GenerationLog | undefined;
    if (params.media_prompt || params.pipeline_template) {
      // Compute top pillar from content_pillar_performance
      const topPillar = tactics.content_pillar_performance?.length
        ? tactics.content_pillar_performance[0].pillar
        : "unknown";

      // Compute recommended (most underrepresented) pillar from history
      let recommendedPillar = "unknown";
      if (soul.content_pillars.length > 0) {
        const counts: Record<string, number> = {};
        for (const p of soul.content_pillars) counts[p.name] = 0;
        for (const p of history) {
          const pillar = p.content_pillar || "uncategorized";
          if (counts[pillar] !== undefined) counts[pillar]++;
        }
        const total = history.length || 1;
        let maxGap = -Infinity;
        for (const p of soul.content_pillars) {
          const actual = counts[p.name] / total;
          const gap = p.weight - actual;
          if (gap > maxGap) {
            maxGap = gap;
            recommendedPillar = p.name;
          }
        }
      }

      generationLog = {
        media_prompt: params.media_prompt || "",
        pipeline_template: params.pipeline_template || "",
        post_type,
        tactics_snapshot: {
          hook_style: tactics.visual_style.hook_style,
          visual_style: tactics.visual_style.current_best,
          color_trends: tactics.visual_style.color_trends,
          cta_style: tactics.caption_patterns.cta_style,
          emoji_usage: tactics.caption_patterns.emoji_usage,
          optimal_length_chars: tactics.caption_patterns.optimal_length.chars,
          optimal_hashtag_count: tactics.hashtag_strategy.optimal_count,
          top_pillar_at_creation: topPillar,
          recommended_pillar_at_creation: recommendedPillar,
        },
      };
    }

    // 9. Log to history (one entry per platform)
    const baseEntry = {
      pipeline,
      created_at: new Date().toISOString(),
      posted_at: new Date().toISOString(),
      post_type,
      caption,
      hashtags,
      media_path,
      content_pillar: params.content_pillar || "uncategorized",
      tactics_version_used: tactics.version,
      soul_version_used: soul.version,
      ...(generationLog ? { generation_log: generationLog } : {}),
      metrics: {
        collected_at: "",
        views: 0,
        viewers: 0,
        engagement: 0,
        comments: 0,
        net_follows: 0,
        impressions: 0,
        distribution: null,
        watch_time_ms: 0,
        engagement_rate: 0,
        comment_rate: 0,
        hook_rate: 0,
        rewatch_ratio: 0,
        avg_watch_time_ms: 0,
        reach: 0,
        likes: 0,
        shares: 0,
        saves: 0,
        video_views: 0,
        completion_rate: 0,
        profile_visits: 0,
        engagement_score: 0,
        save_rate: 0,
        share_rate: 0,
      },
      metrics_harvests: 0,
      metrics_complete: false,
    };

    if (igResult.post_id) {
      appendJSONL(postsHistoryPath(), {
        ...baseEntry,
        id: uuidv4(),
        platform: "instagram",
        platform_post_id: igResult.post_id,
      });
    }

    if (fbResult.post_id) {
      appendJSONL(postsHistoryPath(), {
        ...baseEntry,
        id: uuidv4(),
        platform: "facebook",
        platform_post_id: fbResult.post_id,
      });
    }

    // 10. Archive media
    const archivePath = path.join(archiveDir(), path.basename(media_path));
    try {
      moveFile(media_path, archivePath);
    } catch {
      // Non-fatal: media stays in staging
    }

    return {
      success: true,
      ig_post_id: igResult.post_id || undefined,
      fb_post_id: fbResult.post_id || undefined,
      ig_url: igResult.url || undefined,
      fb_url: fbResult.url || undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
    };
  }
}
