// Bundled content for the files Omni OS pushes into a client repo to enable
// the coding agent. Kept as string constants (not read from disk) so the
// serverless route always has them regardless of the deployment bundle.

// The label Omni OS adds to an issue to trigger the repo's coding-agent
// workflow. The workflow's `if:` condition matches this exact value.
export const AGENT_BUILD_LABEL = "agent:build";

export const AGENT_WORKFLOW_PATH = ".github/workflows/claude-issue-to-pr.yml";
export const AGENT_CLAUDE_MD_PATH = "CLAUDE.md";

// NOTE: GitHub Actions expressions use ${{ ... }}. In this template literal each
// is written as \${{ ... }} so JS does not treat it as string interpolation.
export const AGENT_WORKFLOW_YAML = `# Omni OS -> coding agent
#
# Added automatically by Omni OS. When an issue is labeled "agent:build",
# Claude Code implements it on a branch and opens a pull request. Nothing
# reaches the default branch until a human merges the PR.
#
# Requires (one-time, per repo unless set at the account level):
#   - repo secret ANTHROPIC_API_KEY
#   - Settings > Actions > General > Workflow permissions:
#     "Allow GitHub Actions to create and approve pull requests"

name: Claude issue to PR

on:
  issues:
    types: [labeled]

jobs:
  build:
    if: github.event.label.name == 'agent:build'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code on the issue
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          # Omni OS's GitHub App (a bot) is what adds the agent:build label,
          # so bot-initiated runs must be allowed. The label gate above still
          # limits this to intentional Omni OS dispatches.
          allowed_bots: "*"
          prompt: |
            Implement GitHub issue #\${{ github.event.issue.number }} in this repository.

            Read the issue title and body carefully - they contain the summary,
            requirements, acceptance criteria, implementation notes, and testing
            notes. Follow the repository's CLAUDE.md conventions if present.

            Do the work on a new branch named agent/issue-\${{ github.event.issue.number }},
            keep the change focused on this issue only, run the build/tests if the
            project defines them, and open a pull request that closes the issue
            (include "Closes #\${{ github.event.issue.number }}" in the PR body).

            Do not merge the pull request. A human will review and merge it.
`;

export const AGENT_CLAUDE_MD_STARTER = `# Coding agent guide

This file tells the coding agent how to work in this repository. Edit it to
match the project — the more accurate it is, the better the pull requests.

## Conventions
- Look at neighboring files first and match the existing structure, naming, and style.
- Keep every change scoped to the issue being implemented. No unrelated refactors.
- Make all new UI responsive (mobile 393px through desktop).
- Do not add new dependencies unless the issue requires it.
- Do not touch environment variables, secrets, or CI configuration.

## Definition of done
- The change satisfies every acceptance criterion in the issue.
- The project builds (run the build/test commands if they exist).
- The pull request description explains what changed and lists anything left
  for a human (for example: final copy to be provided by the client).
`;
