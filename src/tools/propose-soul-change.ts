import { proposeSoulChange, SoulProposal } from "../tiers/soul";

export interface ProposeSoulChangeParams {
  field: string;
  proposed_value: any;
  evidence: string;
  supporting_posts: string[];
}

export interface ProposeSoulChangeResult {
  success: boolean;
  proposal_id?: string;
  status?: string;
  error?: string;
}

/**
 * Tool: smi_propose_soul_change
 *
 * Queue a Tier 2 Soul change for human approval.
 * Soul changes require strong evidence and are NOT auto-applied.
 */
export async function proposeSoulChangeTool(
  params: ProposeSoulChangeParams
): Promise<ProposeSoulChangeResult> {
  try {
    const { field, proposed_value, evidence, supporting_posts } = params;

    if (!field) {
      return {
        success: false,
        error: 'Missing required field: "field" (dot-path to Soul property, e.g., "brand_voice.tone")',
      };
    }

    if (proposed_value === undefined || proposed_value === null) {
      return {
        success: false,
        error: 'Missing required field: "proposed_value"',
      };
    }

    if (!evidence) {
      return {
        success: false,
        error: 'Missing required field: "evidence" — Soul changes require evidence-backed justification',
      };
    }

    const proposal: SoulProposal = proposeSoulChange({
      field,
      proposed_value,
      evidence,
      supporting_posts: supporting_posts || [],
    });

    return {
      success: true,
      proposal_id: proposal.id,
      status: "pending",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
    };
  }
}
