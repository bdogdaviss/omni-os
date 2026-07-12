import assert from "node:assert/strict";

import {
  AGENT_BUILD_LABEL,
  AGENT_BUILD_OPENAI_LABEL,
  AGENT_WORKFLOW_YAML,
  agentBuildLabel,
} from "./agent-workflow-template.ts";

assert.equal(agentBuildLabel("claude"), AGENT_BUILD_LABEL);
assert.equal(agentBuildLabel("openai"), AGENT_BUILD_OPENAI_LABEL);
assert.notEqual(AGENT_BUILD_LABEL, AGENT_BUILD_OPENAI_LABEL);
assert.match(AGENT_WORKFLOW_YAML, /Run Claude Code on the issue/);
assert.match(AGENT_WORKFLOW_YAML, /Run OpenAI Codex on the issue/);
console.log("agent-workflow-template.check.ts: all checks passed");
