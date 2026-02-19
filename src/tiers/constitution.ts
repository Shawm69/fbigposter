import { readJSON } from "../storage/files";
import { constitutionPath } from "../storage/paths";

export interface ContentPolicies {
  max_posts_per_day: {
    reels: number;
    image_posts: number;
    stories: number;
  };
  required_disclosures: string[];
  forbidden_hashtags: string[];
}

export interface Constitution {
  version: number;
  banned_topics: string[];
  legal_requirements: string[];
  brand_red_lines: string[];
  media_generation_rules: string[];
  content_policies: ContentPolicies;
}

/**
 * Load the Constitution (Tier 1). This is IMMUTABLE — the plugin never writes to it.
 * Only the human can edit it directly.
 */
export function loadConstitution(): Constitution {
  const data = readJSON<Constitution>(constitutionPath());
  if (!data) {
    throw new Error(
      "Constitution not found. Run 'smi init' to set up the workspace."
    );
  }
  return data;
}

/**
 * Validate content against Constitution rules.
 * Returns an array of violations (empty = valid).
 */
export function validateAgainstConstitution(
  constitution: Constitution,
  content: {
    caption?: string;
    hashtags?: string[];
    pipeline?: string;
  }
): string[] {
  const violations: string[] = [];
  const caption = (content.caption || "").toLowerCase();

  // Check banned topics
  for (const topic of constitution.banned_topics) {
    if (caption.includes(topic.toLowerCase())) {
      violations.push(`Caption contains banned topic: "${topic}"`);
    }
  }

  // Check forbidden hashtags
  if (content.hashtags) {
    for (const tag of content.hashtags) {
      const normalizedTag = tag.toLowerCase().replace(/^#/, "");
      for (const forbidden of constitution.content_policies.forbidden_hashtags) {
        if (normalizedTag === forbidden.toLowerCase().replace(/^#/, "")) {
          violations.push(`Forbidden hashtag used: "${tag}"`);
        }
      }
    }
  }

  // Check required disclosures
  for (const disclosure of constitution.content_policies.required_disclosures) {
    const normalizedDisclosure = disclosure.toLowerCase().replace(/^#/, "");
    const allText = caption + " " + (content.hashtags || []).join(" ").toLowerCase();
    if (!allText.includes(normalizedDisclosure.toLowerCase())) {
      violations.push(`Missing required disclosure: "${disclosure}"`);
    }
  }

  // Check brand red lines (simple keyword check)
  for (const redLine of constitution.brand_red_lines) {
    // Extract key terms from the red line for basic matching
    if (redLine.toLowerCase().includes("profanity")) {
      // This would need a profanity word list in production
    }
  }

  return violations;
}

/**
 * Check if a pipeline has reached its daily posting limit.
 */
export function checkDailyLimit(
  constitution: Constitution,
  pipeline: "reels" | "image_posts" | "stories",
  postsToday: number
): boolean {
  const limit = constitution.content_policies.max_posts_per_day[pipeline];
  return postsToday < limit;
}
