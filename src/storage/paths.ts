import * as path from "path";

export type Pipeline = "reels" | "image_posts" | "stories";

let workspaceRoot = process.cwd();

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

// Tier files
export function constitutionPath(): string {
  return path.join(workspaceRoot, "tiers", "constitution.json");
}

export function soulPath(): string {
  return path.join(workspaceRoot, "tiers", "soul.json");
}

export function tacticsPath(pipeline: Pipeline): string {
  const filename = pipeline.replace(/_/g, "-") + ".json";
  return path.join(workspaceRoot, "tiers", "tactics", filename);
}

// History
export function postsHistoryPath(): string {
  return path.join(workspaceRoot, "history", "posts.jsonl");
}

// Events
export function eventsLogPath(): string {
  return path.join(workspaceRoot, "history", "events.jsonl");
}

// Schedule
export function schedulePath(date: string): string {
  return path.join(workspaceRoot, "schedule", `${date}.json`);
}

// Queue
export function soulProposalsPath(): string {
  return path.join(workspaceRoot, "queue", "soul-proposals.json");
}

// Media
export function stagingDir(): string {
  return path.join(workspaceRoot, "media", "staging");
}

export function archiveDir(): string {
  return path.join(workspaceRoot, "media", "archive");
}

// Auth
export function metaTokensPath(): string {
  return path.join(workspaceRoot, "auth", "meta-tokens.json");
}

// Status
export function statusPath(): string {
  return path.join(workspaceRoot, "status.json");
}

// Plugin data (default templates)
export function pluginDataDir(): string {
  return path.join(__dirname, "..", "..", "..", "data");
}

// All workspace directories that need to exist
export function allWorkspaceDirs(): string[] {
  return [
    path.join(workspaceRoot, "tiers"),
    path.join(workspaceRoot, "tiers", "tactics"),
    path.join(workspaceRoot, "history"),
    path.join(workspaceRoot, "schedule"),
    path.join(workspaceRoot, "queue"),
    path.join(workspaceRoot, "media", "staging"),
    path.join(workspaceRoot, "media", "archive"),
    path.join(workspaceRoot, "auth"),
  ];
}
