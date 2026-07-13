import assert from "node:assert/strict";

import { selectedProposalScope } from "./proposal-tier.ts";

const proposal = {
  lean_mvp: { scope: ["docs"] },
  core_build: { scope: ["docs", "tracking"] },
  full_launch: { scope: ["docs", "tracking", "notifications"] },
};

assert.equal(
  selectedProposalScope({ ...proposal, selected_tier: null }),
  null,
);
assert.deepEqual(
  selectedProposalScope({ ...proposal, selected_tier: "lean_mvp" }),
  proposal.lean_mvp,
);
assert.deepEqual(
  selectedProposalScope({ ...proposal, selected_tier: "core_build" }),
  proposal.core_build,
);
assert.deepEqual(
  selectedProposalScope({ ...proposal, selected_tier: "full_launch" }),
  proposal.full_launch,
);

console.log("proposal-tier.check.ts: all checks passed");
