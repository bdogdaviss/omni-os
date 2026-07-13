export type ProposalTier = "lean_mvp" | "core_build" | "full_launch";

export function selectedProposalScope(proposal: {
  lean_mvp: unknown;
  core_build: unknown;
  full_launch: unknown;
  selected_tier: ProposalTier | null;
}) {
  return proposal.selected_tier ? proposal[proposal.selected_tier] : null;
}
