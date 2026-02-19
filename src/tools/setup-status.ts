import { readJSON, readJSONL, fileExists } from "../storage/files";
import {
  getWorkspaceRoot,
  constitutionPath,
  soulPath,
  tacticsPath,
  postsHistoryPath,
  metaTokensPath,
  statusPath,
} from "../storage/paths";
import { MetaTokens } from "../meta-api/client";
import * as path from "path";

export interface SetupStatus {
  mode: "setup" | "supervised" | "autonomous";
  setup_complete: boolean;
  workspace_initialized: boolean;
  tiers: {
    constitution_exists: boolean;
    constitution_customized: boolean;
    soul_exists: boolean;
    soul_customized: boolean;
    tactics: { reels: boolean; image_posts: boolean; stories: boolean };
  };
  auth: {
    configured: boolean;
    token_days_remaining: number;
    page_id: string | null;
    ig_user_id: string | null;
  };
  config_exists: boolean;
  posts_count: number;
  missing_steps: string[];
  next_step: string;
}

export function setupStatusTool(): SetupStatus {
  const root = getWorkspaceRoot();

  // Check workspace initialization
  const workspaceInitialized = fileExists(constitutionPath()) || fileExists(soulPath());

  // Check constitution
  const constitutionExists = fileExists(constitutionPath());
  const constitution = constitutionExists ? readJSON<any>(constitutionPath()) : null;
  const constitutionCustomized = constitutionExists && constitution && !constitution._template;

  // Check soul
  const soulExists = fileExists(soulPath());
  const soul = soulExists ? readJSON<any>(soulPath()) : null;
  const soulCustomized = soulExists && soul && !soul._template;

  // Check tactics
  const reelsTactics = fileExists(tacticsPath("reels"));
  const imagePostsTactics = fileExists(tacticsPath("image_posts"));
  const storiesTactics = fileExists(tacticsPath("stories"));

  // Check auth
  const tokens = readJSON<MetaTokens>(metaTokensPath());
  let tokenDaysRemaining = 0;
  if (tokens?.token_expires_at) {
    const expiresAt = new Date(tokens.token_expires_at);
    tokenDaysRemaining = Math.max(
      0,
      Math.round(((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) * 10) / 10
    );
  }

  // Check config
  const configPath = path.join(root, "config.json");
  const configExists = fileExists(configPath);

  // Count posts
  const posts = readJSONL<any>(postsHistoryPath());
  const postsCount = posts.length;

  // Check status file
  const status = readJSON<any>(statusPath());
  const setupComplete = status?.setup_complete === true;

  // Determine missing steps
  const missingSteps: string[] = [];

  if (!workspaceInitialized) {
    missingSteps.push("workspace_init");
  }
  if (!soulCustomized) {
    // Soul covers brand identity, audience, content pillars, visual identity
    if (!soul || !soul.brand_voice || soul._template) {
      missingSteps.push("brand_identity");
    }
    if (!soul || !soul.audience || soul._template) {
      missingSteps.push("audience");
    }
    if (!soul || !soul.content_pillars || soul._template) {
      missingSteps.push("content_pillars");
    }
    if (!soul || !soul.visual_identity || soul._template) {
      missingSteps.push("visual_identity");
    }
  }

  // Creative direction steps (after visual_identity, before pipelines_schedule)
  if (!soul?.creative_direction) {
    missingSteps.push("creative_examples", "content_themes", "platform_direction");
  } else {
    const cd = soul.creative_direction;
    if (!cd.example_prompts?.length || !cd.example_captions?.length) {
      missingSteps.push("creative_examples");
    }
    if (
      !cd.content_themes?.length ||
      (!cd.negative_guidance?.visual_avoid?.length && !cd.negative_guidance?.caption_avoid?.length)
    ) {
      missingSteps.push("content_themes");
    }
    if (!cd.duration_pacing?.preferred_duration_seconds || !cd.platform_tweaks?.instagram) {
      missingSteps.push("platform_direction");
    }
  }

  if (!configExists) {
    missingSteps.push("pipelines_schedule");
  }
  if (!constitutionCustomized) {
    missingSteps.push("safety_rails");
  }
  if (!tokens || tokenDaysRemaining <= 0) {
    missingSteps.push("auth");
  }
  if (!setupComplete) {
    missingSteps.push("confirmation");
  }

  // Determine mode
  let mode: "setup" | "supervised" | "autonomous";
  if (!setupComplete) {
    mode = "setup";
  } else if (postsCount < 10) {
    mode = "supervised";
  } else {
    mode = "autonomous";
  }

  return {
    mode,
    setup_complete: setupComplete,
    workspace_initialized: workspaceInitialized,
    tiers: {
      constitution_exists: constitutionExists,
      constitution_customized: !!constitutionCustomized,
      soul_exists: soulExists,
      soul_customized: !!soulCustomized,
      tactics: {
        reels: reelsTactics,
        image_posts: imagePostsTactics,
        stories: storiesTactics,
      },
    },
    auth: {
      configured: !!tokens && tokenDaysRemaining > 0,
      token_days_remaining: tokenDaysRemaining,
      page_id: tokens?.page_id || null,
      ig_user_id: tokens?.ig_user_id || null,
    },
    config_exists: configExists,
    posts_count: postsCount,
    missing_steps: missingSteps,
    next_step: missingSteps[0] || "none",
  };
}
