import { readJSON, writeJSON } from "../storage/files";
import { soulPath, soulProposalsPath, Pipeline } from "../storage/paths";
import { v4 as uuidv4 } from "uuid";

export interface ContentPillar {
  name: string;
  description: string;
  weight: number;
}

export interface CreativeDirection {
  example_prompts: Array<{
    tool: "sora" | "grok";
    prompt: string;
    description: string;
  }>;
  example_captions: Array<{
    text: string;
    pipeline?: Pipeline;
    what_works: string;
  }>;
  content_themes: Array<{
    pillar: string;
    ideas: string[];
  }>;
  negative_guidance: {
    visual_avoid: string[];
    caption_avoid: string[];
    theme_avoid: string[];
  };
  duration_pacing: {
    preferred_duration_seconds: number;
    pacing: string;
    hook_duration_seconds: number;
    structure: string;
  };
  platform_tweaks: {
    instagram: {
      feed_aesthetic: string;
      story_style: string;
      reel_style: string;
    };
    facebook: {
      post_style: string;
      audience_difference: string;
    };
  };
}

export interface Soul {
  version: number;
  last_modified: string;
  brand_voice: {
    tone: string;
    personality_traits: string[];
    writing_style: string;
  };
  audience: {
    primary_demographic: string;
    interests: string[];
    pain_points: string[];
  };
  content_pillars: ContentPillar[];
  visual_identity: {
    color_palette: string[];
    preferred_aesthetics: string;
    logo_usage: string;
  };
  creative_direction?: CreativeDirection;
  change_log: SoulChangeLogEntry[];
}

export interface SoulChangeLogEntry {
  date: string;
  field: string;
  old_value: any;
  new_value: any;
  reason: string;
}

export interface SoulProposal {
  id: string;
  proposed_at: string;
  field: string;
  current_value: any;
  proposed_value: any;
  evidence: string;
  supporting_posts: string[];
  status: "pending" | "approved" | "rejected";
}

/**
 * Load the Soul (Tier 2).
 */
export function loadSoul(): Soul {
  const data = readJSON<Soul>(soulPath());
  if (!data) {
    throw new Error("Soul not found. Run 'smi init' to set up the workspace.");
  }
  return data;
}

/**
 * Create a soul change proposal. Does NOT apply the change.
 */
export function proposeSoulChange(proposal: {
  field: string;
  proposed_value: any;
  evidence: string;
  supporting_posts: string[];
}): SoulProposal {
  const soul = loadSoul();

  // Get current value at the field path
  const currentValue = getNestedValue(soul, proposal.field);

  const entry: SoulProposal = {
    id: uuidv4(),
    proposed_at: new Date().toISOString(),
    field: proposal.field,
    current_value: currentValue,
    proposed_value: proposal.proposed_value,
    evidence: proposal.evidence,
    supporting_posts: proposal.supporting_posts,
    status: "pending",
  };

  const proposals = readJSON<SoulProposal[]>(soulProposalsPath()) || [];
  proposals.push(entry);
  writeJSON(soulProposalsPath(), proposals);

  return entry;
}

/**
 * Apply an approved soul change proposal.
 */
export function applyApprovedSoulChange(proposalId: string): Soul {
  const proposals = readJSON<SoulProposal[]>(soulProposalsPath()) || [];
  const proposal = proposals.find((p) => p.id === proposalId);

  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }
  if (proposal.status !== "approved") {
    throw new Error(`Proposal ${proposalId} is not approved (status: ${proposal.status})`);
  }

  const soul = loadSoul();

  // Apply the change
  setNestedValue(soul, proposal.field, proposal.proposed_value);

  // Update version and timestamp
  soul.version += 1;
  soul.last_modified = new Date().toISOString();

  // Add to change log
  soul.change_log.push({
    date: new Date().toISOString(),
    field: proposal.field,
    old_value: proposal.current_value,
    new_value: proposal.proposed_value,
    reason: proposal.evidence,
  });

  writeJSON(soulPath(), soul);

  // Mark proposal as applied (keep for history)
  const updatedProposals = proposals.map((p) =>
    p.id === proposalId ? { ...p, status: "approved" as const } : p
  );
  writeJSON(soulProposalsPath(), updatedProposals);

  return soul;
}

/**
 * Get pending soul proposals.
 */
export function getPendingSoulProposals(): SoulProposal[] {
  const proposals = readJSON<SoulProposal[]>(soulProposalsPath()) || [];
  return proposals.filter((p) => p.status === "pending");
}

/**
 * Update a proposal's status (approve or reject).
 */
export function updateProposalStatus(
  proposalId: string,
  status: "approved" | "rejected"
): SoulProposal {
  const proposals = readJSON<SoulProposal[]>(soulProposalsPath()) || [];
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    throw new Error(`Proposal ${proposalId} not found`);
  }
  proposals[idx].status = status;
  writeJSON(soulProposalsPath(), proposals);

  if (status === "approved") {
    applyApprovedSoulChange(proposalId);
  }

  return proposals[idx];
}

// Helper: get a nested value from an object by dot-path
export function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((o, key) => (o ? o[key] : undefined), obj);
}

// Helper: set a nested value on an object by dot-path
export function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const target = keys.reduce((o, key) => {
    if (!o[key]) o[key] = {};
    return o[key];
  }, obj);
  target[lastKey] = value;
}
