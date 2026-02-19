import * as path from "path";
import { ensureDir, copyFile, fileExists } from "../storage/files";
import {
  getWorkspaceRoot,
  allWorkspaceDirs,
  pluginDataDir,
  constitutionPath,
  soulPath,
  tacticsPath,
} from "../storage/paths";

export interface InitResult {
  success: boolean;
  workspace: string;
  dirs_created: string[];
  files_copied: string[];
  files_skipped: string[];
}

export function initTool(): InitResult {
  const workspace = getWorkspaceRoot();
  const dataDir = pluginDataDir();

  // 1. Create all workspace directories
  const dirs = allWorkspaceDirs();
  const dirsCreated: string[] = [];
  for (const dir of dirs) {
    ensureDir(dir);
    dirsCreated.push(path.relative(workspace, dir));
  }

  // 2. Copy template files (only if target doesn't already exist)
  const templateMap: Array<{ src: string; dest: string; label: string }> = [
    {
      src: path.join(dataDir, "constitution.json"),
      dest: constitutionPath(),
      label: "constitution.json",
    },
    {
      src: path.join(dataDir, "soul.json"),
      dest: soulPath(),
      label: "soul.json",
    },
    {
      src: path.join(dataDir, "tactics", "reels.json"),
      dest: tacticsPath("reels"),
      label: "tactics/reels.json",
    },
    {
      src: path.join(dataDir, "tactics", "image-posts.json"),
      dest: tacticsPath("image_posts"),
      label: "tactics/image-posts.json",
    },
    {
      src: path.join(dataDir, "tactics", "stories.json"),
      dest: tacticsPath("stories"),
      label: "tactics/stories.json",
    },
  ];

  const filesCopied: string[] = [];
  const filesSkipped: string[] = [];

  for (const { src, dest, label } of templateMap) {
    if (fileExists(dest)) {
      filesSkipped.push(label);
    } else {
      copyFile(src, dest);
      filesCopied.push(label);
    }
  }

  return {
    success: true,
    workspace,
    dirs_created: dirsCreated,
    files_copied: filesCopied,
    files_skipped: filesSkipped,
  };
}
