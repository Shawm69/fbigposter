import { Type, Static } from "@sinclair/typebox";

export const PipelineConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  daily_target: Type.Number({ default: 1, minimum: 0, maximum: 10 }),
});

export const ConfigSchema = Type.Object({
  meta: Type.Object({
    app_id: Type.String({ description: "Meta App ID from Developer Console" }),
    app_secret: Type.String({ description: "Meta App Secret (stored encrypted)" }),
    page_id: Type.String({ description: "Facebook Page ID" }),
    ig_user_id: Type.String({ description: "Instagram Business Account ID" }),
  }),
  schedule: Type.Object({
    timezone: Type.String({ default: "America/New_York", description: "IANA timezone" }),
    nightly_analysis_time: Type.String({ default: "02:00", description: "When to run nightly analysis (HH:MM)" }),
    posting_windows: Type.Object({
      start: Type.String({ default: "08:00", description: "Earliest posting time (HH:MM)" }),
      end: Type.String({ default: "21:00", description: "Latest posting time (HH:MM)" }),
    }),
  }),
  pipelines: Type.Object({
    reels: PipelineConfigSchema,
    image_posts: PipelineConfigSchema,
    stories: PipelineConfigSchema,
  }),
  media: Type.Object({
    staging_dir: Type.String({ default: "media/staging", description: "Where generated media is saved before posting" }),
    archive_dir: Type.String({ default: "media/archive", description: "Where posted media is archived" }),
  }),
  metrics: Type.Object({
    harvest_intervals: Type.Array(Type.Number(), {
      default: [30, 1440, 10080],
      description: "Minutes after posting to collect metrics",
    }),
    engagement_weights: Type.Object({
      likes: Type.Number({ default: 1 }),
      comments: Type.Number({ default: 3 }),
      shares: Type.Number({ default: 5 }),
      saves: Type.Number({ default: 4 }),
      reach: Type.Number({ default: 0.01 }),
    }),
  }),
  workflows: Type.Object({
    sora: Type.Object({
      storyboard_url: Type.String({ default: "https://sora.chatgpt.com/storyboard", description: "Sora storyboard page for prompt submission" }),
      drafts_url: Type.String({ default: "https://sora.chatgpt.com/drafts", description: "Sora drafts page where generated videos appear" }),
      default_duration: Type.Number({ default: 10, description: "Default video duration in seconds" }),
      default_aspect_ratio: Type.String({ default: "9:16", description: "Default video aspect ratio" }),
    }),
    grok: Type.Object({
      url: Type.String({ default: "https://grok.com/imagine", description: "Grok Imagine URL" }),
      default_aspect_ratio: Type.String({ default: "1:1", description: "Default image aspect ratio" }),
    }),
    retry_attempts: Type.Number({ default: 3, description: "Number of retry attempts for media generation" }),
    retry_delay_ms: Type.Number({ default: 10000, description: "Delay between retries in milliseconds" }),
  }),
});

export type PluginConfig = Static<typeof ConfigSchema>;

export const DEFAULT_CONFIG: PluginConfig = {
  meta: {
    app_id: "",
    app_secret: "",
    page_id: "",
    ig_user_id: "",
  },
  schedule: {
    timezone: "America/New_York",
    nightly_analysis_time: "02:00",
    posting_windows: {
      start: "08:00",
      end: "21:00",
    },
  },
  pipelines: {
    reels: { enabled: true, daily_target: 2 },
    image_posts: { enabled: true, daily_target: 1 },
    stories: { enabled: true, daily_target: 2 },
  },
  media: {
    staging_dir: "media/staging",
    archive_dir: "media/archive",
  },
  metrics: {
    harvest_intervals: [30, 1440, 10080],
    engagement_weights: {
      likes: 1,
      comments: 3,
      shares: 5,
      saves: 4,
      reach: 0.01,
    },
  },
  workflows: {
    sora: {
      storyboard_url: "https://sora.chatgpt.com/storyboard",
      drafts_url: "https://sora.chatgpt.com/drafts",
      default_duration: 10,
      default_aspect_ratio: "9:16",
    },
    grok: {
      url: "https://grok.com/imagine",
      default_aspect_ratio: "1:1",
    },
    retry_attempts: 3,
    retry_delay_ms: 10000,
  },
};
