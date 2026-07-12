// Bundled content for the files Omni OS pushes into a client repo to enable
// the coding agent. Kept as string constants (not read from disk) so the
// serverless route always has them regardless of the deployment bundle.

// The label Omni OS adds to an issue to trigger the repo's coding-agent
// workflow. The workflow's `if:` condition matches this exact value.
export const AGENT_BUILD_LABEL = "agent:build";

export const AGENT_WORKFLOW_PATH = ".github/workflows/claude-issue-to-pr.yml";
export const AGENT_CLAUDE_MD_PATH = "CLAUDE.md";

export const MARKETING_VIDEO_WORKFLOW_PATH = ".github/workflows/omni-marketing-video.yml";
export const MARKETING_VIDEO_WORKFLOW_YAML = `# Omni OS -> marketing video
name: Omni marketing video

on:
  repository_dispatch:
    types: [omni-marketing-video]
  workflow_dispatch:
    inputs:
      job_id: { required: true, type: string }
      production_brief: { required: true, type: string }
      callback_url: { required: true, type: string }
      provider: { required: true, type: choice, options: [claude, openai] }

jobs:
  render:
    runs-on: ubuntu-latest
    timeout-minutes: 50
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Install video tooling
        run: sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
      - name: Produce the repository walkthrough
        if: \${{ (github.event.client_payload.provider || inputs.provider) == 'claude' }}
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          allowed_bots: "*"
          claude_args: "--dangerously-skip-permissions --model claude-sonnet-5 --max-turns 70 --disallowedTools WebSearch,WebFetch"
          prompt: |
            Create a real marketing walkthrough video from the CURRENT state of this repository.

            \${{ github.event.client_payload.production_brief || inputs.production_brief }}

            Analyze the repository before choosing commands. Boot the real web app with the minimum setup it supports. Use Playwright or Puppeteer to exercise real screens when possible; deterministic repo-derived HTML animation is acceptable when auth or external services make a real walkthrough impossible. Use ffmpeg to produce marketing-output/video.mp4 as H.264/yuv420p with faststart. It must be under 50 MB. Do not commit, push, open a PR, or modify remote state. The only required deliverable is that MP4.
      - name: Run OpenAI coding agent
        if: \${{ (github.event.client_payload.provider || inputs.provider) == 'openai' }}
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          PRODUCTION_BRIEF: \${{ github.event.client_payload.production_brief || inputs.production_brief }}
        run: |
          test -n "$OPENAI_API_KEY"
          printenv OPENAI_API_KEY | npx -y @openai/codex login --with-api-key
          npx -y @openai/codex exec --dangerously-bypass-approvals-and-sandbox "Create a real marketing walkthrough video from the CURRENT state of this repository. Analyze the repo, use Playwright/Puppeteer or deterministic repo-derived HTML, and use ffmpeg to produce marketing-output/video.mp4 as H.264/yuv420p with faststart under 50 MB. Do not commit or push. Production brief: $PRODUCTION_BRIEF"
          printf '%s' 'OpenAI Codex · gpt-5.6-sol' > /tmp/video-provider
      - name: Record Claude provider
        if: \${{ (github.event.client_payload.provider || inputs.provider) == 'claude' }}
        run: printf '%s' 'Claude · claude-sonnet-5' > /tmp/video-provider
      - name: Validate MP4
        run: |
          test -s marketing-output/video.mp4
          test "$(stat -c%s marketing-output/video.mp4)" -le 52428800
          ffprobe -v error -show_entries format=format_name,duration -of json marketing-output/video.mp4
      - name: Keep diagnostic artifact
        uses: actions/upload-artifact@v4
        with:
          name: marketing-video-\${{ github.event.client_payload.job_id || inputs.job_id }}
          path: marketing-output/video.mp4
          if-no-files-found: error
          retention-days: 14
      - name: Return video to Omni OS
        run: |
          curl --fail-with-body --retry 3 --retry-all-errors -H "Content-Type: video/mp4" -H "X-Video-Provider: $(cat /tmp/video-provider)" --data-binary @marketing-output/video.mp4 "\${{ github.event.client_payload.callback_url || inputs.callback_url }}"
      - name: Report failure to Omni OS
        if: failure()
        run: |
          curl --fail-with-body --retry 3 -H "Content-Type: application/json" --data '{"error":"Repository video workflow failed. Open the retained GitHub Actions logs for details."}' "\${{ github.event.client_payload.callback_url || inputs.callback_url }}"
`;

// NOTE: GitHub Actions expressions use ${{ ... }}. In this template literal each
// is written as \${{ ... }} so JS does not treat it as string interpolation.
export const AGENT_WORKFLOW_YAML = `# Omni OS -> coding agent
#
# Added automatically by Omni OS. When an issue is labeled "agent:build",
# Claude Code implements it on a branch off "staging" and opens a pull request
# back into "staging". Omni OS's pipeline merges that PR automatically once
# the independent build check passes. Nothing ever reaches the default branch
# from this workflow — promoting staging is always a human decision.
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
    # Hard wall-clock ceiling so a stuck run can't burn budget indefinitely.
    timeout-minutes: 50
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
          # This runs non-interactively in CI, so let Claude use its tools
          # (edit files, run git/gh, run the build) without approval prompts.
          # The ephemeral runner and the human PR review are the safety net.
          # Pin to Sonnet 5. --max-turns caps a runaway loop; disallowing web
          # tools keeps the agent from wandering off into unrelated web content.
          claude_args: "--dangerously-skip-permissions --model claude-sonnet-5 --max-turns 70 --disallowedTools WebSearch,WebFetch"
          prompt: |
            Implement GitHub issue #\${{ github.event.issue.number }} in this repository.

            Read the issue title and body carefully - they contain the summary,
            requirements, acceptance criteria, implementation notes, and testing
            notes. Follow the repository's CLAUDE.md conventions if present.

            Work efficiently to keep the run cheap: read only files relevant to
            this issue rather than exploring the whole repo, run the build once
            near the end (not after every edit), and add no new dependencies
            unless the issue requires them.

            Base your work on the staging branch: run
            "git checkout staging" first (if staging does not exist, create it
            from the default branch with "git checkout -b staging" and push it).
            Then do the work on a new branch named
            agent/issue-\${{ github.event.issue.number }} created FROM staging —
            earlier tasks in this build have already merged there, and your
            change must build on top of them.

            Keep the change focused on this issue only, run the build/tests if
            the project defines them, and open a pull request whose BASE branch
            is staging (gh pr create --base staging). Reference the issue with
            "Closes #\${{ github.event.issue.number }}" in the PR body.

            Do not merge the pull request. Omni OS merges it automatically once
            its independent build check passes.

      - name: Flag an unfinished build
        # If the agent ran out of turns/time, don't fail silently: comment on
        # the issue and relabel it so it is visibly flagged for a follow-up.
        if: failure()
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          gh label create "agent:needs-attention" --repo \${{ github.repository }} --color d93f0b --description "Coding agent build did not finish" 2>/dev/null || true
          gh issue comment \${{ github.event.issue.number }} --repo \${{ github.repository }} --body "This build did not finish before opening a pull request (it ran out of turns or time). Any partial work is on the branch agent/issue-\${{ github.event.issue.number }} if it exists. Flagged for follow-up — nothing you need to do right now." 2>/dev/null || true
          gh issue edit \${{ github.event.issue.number }} --repo \${{ github.repository }} --add-label "agent:needs-attention" --remove-label "agent:build" 2>/dev/null || true
`;

export const AGENT_PR_CHECK_PATH = ".github/workflows/omni-pr-check.yml";

// Independent CI on every PR. The coding agent runs the build inside its own
// run and reports success — this workflow is the check that ISN'T the process
// being checked, so a human reviewer (or, later, an auto-merge) gets a signal
// that doesn't come from the agent grading its own homework.
export const AGENT_PR_CHECK_YAML = `# Omni OS -> PR check
#
# Added automatically by Omni OS. Builds every pull request so reviewers (and
# any future auto-merge) get a pass/fail signal independent of whoever — human
# or coding agent — authored the change.

name: Omni PR check

on:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci || npm install

      # The gate: the app must build.
      - name: Build
        run: npm run build

      # Informational only — legacy lint debt in a client repo should not
      # block merging an unrelated change.
      - name: Lint
        continue-on-error: true
        run: npm run lint --if-present
`;

// The starter CLAUDE.md pushed into client repos. Stored base64-encoded so
// the markdown (full of backticks) survives as a JS string without escaping.
export const AGENT_CLAUDE_MD_STARTER = Buffer.from(
  "IyBDTEFVREUubWQg4oCUIGNvZGluZyBhZ2VudCBndWlkZSBmb3IgdGhpcyByZXBvCgpZb3UgYXJlIGltcGxlbWVudGluZyBhIEdpdEh1YiBpc3N1ZSBpbiBhICoqY2xpZW50LWZhY2luZyoqIHByb2R1Y3Rpb24gcmVwbyBmb3IKT21uaSBTdHJpdmUuIFRoZSBiYXIgaXMgInByb2Zlc3Npb25hbCwgbmVhdCwgYW5kIHdvcmtzIG9uIGEgY2xpZW50J3MgcGhvbmUgdGhlCmZpcnN0IHRpbWUgdGhleSBvcGVuIHRoZSBsaW5rLiIgUHJpb3JpdGl6ZSBjb3JyZWN0bmVzcyBhbmQgcG9saXNoIG92ZXIKY2xldmVybmVzcyBvciBzY29wZS4KCiMjIFN0YWNrCgotIEZyYW1ld29yazogTmV4dC5qcyAoQXBwIFJvdXRlciksIFR5cGVTY3JpcHQsIFJlYWN0IFNlcnZlciBDb21wb25lbnRzIGJ5IGRlZmF1bHQKLSBTdHlsaW5nOiBUYWlsd2luZCBDU1MgKyBzaGFkY24vdWkgKCJuZXcteW9yayIgc3R5bGUsIGBuZXV0cmFsYCBiYXNlLCBDU1MKICB2YXJpYWJsZXMgaW4gYGFwcC9nbG9iYWxzLmNzc2AsIGBjbigpYCBmcm9tIGBAL2xpYi91dGlsc2AgZm9yIGNsYXNzIG1lcmdpbmcpCi0gSWNvbnM6IGBsdWNpZGUtcmVhY3RgIG9ubHkg4oCUIGRvIG5vdCBhZGQgYW5vdGhlciBpY29uIGxpYnJhcnkKLSBEYXRhIC8gYXV0aDogU3VwYWJhc2UgKFBvc3RncmVzICsgQXV0aCArIFJMUykgdmlhIGBAc3VwYWJhc2Uvc3NyYAotIEhvc3Rpbmc6IFZlcmNlbAoKIyMgQ29tbWFuZHMKCi0gSW5zdGFsbDogYG5wbSBpbnN0YWxsYAotIERldjogYG5wbSBydW4gZGV2YAotIEJ1aWxkICgqKmFsd2F5cyBydW4gYmVmb3JlIGZpbmlzaGluZyoqKTogYG5wbSBydW4gYnVpbGRgCi0gTGludDogYG5wbSBydW4gbGludGAKLSBUZXN0OiBydW4gaXQgaWYgYSB0ZXN0IGNvbW1hbmQgZXhpc3RzIGluIGBwYWNrYWdlLmpzb25gOyBvdGhlcndpc2Ugc2tpcAoKIyMgQmVmb3JlIHlvdSB3cml0ZSBjb2RlCgotIFJlYWQgdGhlIGlzc3VlJ3MgYWNjZXB0YW5jZSBjcml0ZXJpYSBmdWxseSBiZWZvcmUgdG91Y2hpbmcgZmlsZXMuCi0gTG9vayBhdCAyLTMgbmVpZ2hib3JpbmcgZmlsZXMgKHNhbWUgZm9sZGVyLCBzYW1lIGtpbmQgb2YgY29tcG9uZW50KSBhbmQgbWF0Y2gKICB0aGVpciBwYXR0ZXJucyBleGFjdGx5IOKAlCBuYW1pbmcsIGZpbGUgbGF5b3V0LCBpbXBvcnQgb3JkZXIsIHByb3Agc2hhcGVzLgotIENoZWNrIGBjb21wb25lbnRzL3VpL2AgZm9yIGFuIGV4aXN0aW5nIHByaW1pdGl2ZSBiZWZvcmUgYnVpbGRpbmcgYSBuZXcgb25lLgogIENvbXBvc2UgZnJvbSBgQnV0dG9uYCwgYENhcmRgLCBgSW5wdXRgLCBgTGFiZWxgLCBgQmFkZ2VgLCBgQ2hlY2tib3hgLAogIGBEcm9wZG93bk1lbnVgLCBldGMuIE9ubHkgYWRkIGEgbmV3IGBjb21wb25lbnRzL3VpLypgIHByaW1pdGl2ZSBpZiBub3RoaW5nCiAgY2xvc2UgZXhpc3RzIOKAlCBhbmQgYnVpbGQgaXQgaW4gdGhlIHNhbWUgc3R5bGUgKGBSZWFjdC5mb3J3YXJkUmVmYCwKICBgY2xhc3MtdmFyaWFuY2UtYXV0aG9yaXR5YCBmb3IgdmFyaWFudHMsIGBjbigpYCBmb3IgY2xhc3MgbWVyZ2luZywgUmFkaXgKICBwcmltaXRpdmUgdW5kZXIgdGhlIGhvb2Qgd2hlbiB0aGVyZSdzIGludGVyYWN0aW9uL2ExMXkgdG8gZ2V0IHJpZ2h0KS4KLSBSZXVzZSBleGlzdGluZyBjb2xvciB0b2tlbnMgKGBiZy1iYWNrZ3JvdW5kYCwgYHRleHQtZm9yZWdyb3VuZGAsCiAgYHRleHQtbXV0ZWQtZm9yZWdyb3VuZGAsIGBib3JkZXItYm9yZGVyYCwgYGJnLWNhcmRgLCBgYmctcHJpbWFyeWAsIGV0Yy4pIGFuZAogIGAtLXJhZGl1c2AtYmFzZWQgcm91bmRpbmcgKGByb3VuZGVkLWxnYCAvIGByb3VuZGVkLW1kYCAvIGByb3VuZGVkLXNtYCkuCiAgTmV2ZXIgaGFyZGNvZGUgaGV4IGNvbG9ycyBvciBpbmxpbmUgc3R5bGVzIHdoZW4gYSB0b2tlbiBleGlzdHMuCgojIyBSZXNwb25zaXZlOiBtb2JpbGUtZmlyc3QsIGFsd2F5cwoKRXZlcnkgc2NyZWVuIHlvdSB0b3VjaCBtdXN0IGxvb2sgaW50ZW50aW9uYWwgZnJvbSBhIDM5M3B4LXdpZGUgaVBob25lIHVwCnRocm91Z2ggYSBkZXNrdG9wIG1vbml0b3Ig4oCUIHRoaXMgaXMgbm9uLW5lZ290aWFibGUsIG1vc3QgY2xpZW50IHRyYWZmaWMgaXMKbW9iaWxlLgoKLSBXcml0ZSB1bnByZWZpeGVkIFRhaWx3aW5kIGNsYXNzZXMgZm9yIHRoZSBzbWFsbGVzdCBzY3JlZW4gZmlyc3QsIHRoZW4gbGF5ZXIKICBgc206YCAvIGBtZDpgIC8gYGxnOmAgZm9yIGxhcmdlciB2aWV3cG9ydHMuIE5ldmVyIGRlc2lnbiBkZXNrdG9wLWZpcnN0IGFuZAogIGhvcGUgaXQgZGVncmFkZXMuCi0gVXNlIGZsdWlkIGxheW91dCBwcmltaXRpdmVzIChgZmxleGAsIGBncmlkYCwgYGdhcC0qYCwgYHctZnVsbGAsCiAgYG1heC13LSpgICsgYG14LWF1dG9gKSBvdmVyIGZpeGVkIHBpeGVsIHdpZHRocy4KLSBUb3VjaCB0YXJnZXRzIGFyZSBhdCBsZWFzdCA0MHB4IHRhbGwgb24gbW9iaWxlIChzaGFkY24ncyBkZWZhdWx0IGBoLTlgL2BoLTEwYAogIGJ1dHRvbiBzaXplcyBhcmUgdGhlIGZsb29yLCBub3QgdGhlIGNlaWxpbmcg4oCUIGRvbid0IHNocmluayB0aGVtIGZ1cnRoZXIpLgotIFRlc3QgeW91ciBvd24gbWVudGFsIG1vZGVsIGFnYWluc3QgMzkzcHgsIDc2OHB4LCBhbmQgMTI4MHB4IGJlZm9yZSBjYWxsaW5nIGEKICBsYXlvdXQgZG9uZS4gSWYgeW91IGNhbid0IHJ1biBhIGJyb3dzZXIsIHJlYXNvbiBleHBsaWNpdGx5IGFib3V0IGhvdyBhIGZsZXgKICByb3cgb2YgMysgaXRlbXMgb3IgYSB3aWRlIHRhYmxlIGJlaGF2ZXMgYXQgMzkzcHgsIGFuZCB3cmFwL3N0YWNrIGFjY29yZGluZ2x5LgotIFRhYmxlcyBhbmQgd2lkZSBjb250ZW50OiB3cmFwIGluIGBvdmVyZmxvdy14LWF1dG9gIHJhdGhlciB0aGFuIGxldHRpbmcgdGhlCiAgcGFnZSBpdHNlbGYgc2Nyb2xsIGhvcml6b250YWxseS4KCiMjIFRleHQgYW5kIGNvbnRlbnQgc2FmZXR5CgpDbGllbnQgYW5kIHVzZXItZ2VuZXJhdGVkIHRleHQgaXMgdW5wcmVkaWN0YWJsZSBsZW5ndGgg4oCUIGEgbG9uZyBlbWFpbCwgYSBsb25nCnByb2plY3QgbmFtZSwgYSBwYXN0ZWQgcGFyYWdyYXBoLiBFdmVyeSBwbGFjZSBkeW5hbWljIHRleHQgcmVuZGVycyBtdXN0CnN1cnZpdmUgaXQgd2l0aG91dCBicmVha2luZyBsYXlvdXQ6CgotIExvbmcgdW5icm9rZW4gc3RyaW5nczogYWRkIGBicmVhay13b3Jkc2AgKG9yIGBicmVhay1hbGxgIGZvciB0aGluZ3MgbGlrZQogIHJhdyBVUkxzL3Rva2Vucykgc28gdGhleSB3cmFwIGluc3RlYWQgb2Ygb3ZlcmZsb3dpbmcgdGhlaXIgY29udGFpbmVyLgotIEZsZXgvZ3JpZCBjaGlsZHJlbiBob2xkaW5nIHRleHQgbmVlZCBgbWluLXctMGAgc28gdGhleSBjYW4gYWN0dWFsbHkgc2hyaW5rOwogIHdpdGhvdXQgaXQsIHRleHQgZm9yY2VzIHNpYmxpbmdzIG9mZi1zY3JlZW4uCi0gVHJ1bmNhdGUgaW50ZW50aW9uYWxseSB3aXRoIGB0cnVuY2F0ZWAgKHNpbmdsZSBsaW5lKSBvbmx5IHdoZW4gdGhlIGZ1bGwgdGV4dAogIGlzIGF2YWlsYWJsZSBlbHNld2hlcmUgKHRpdGxlIGF0dHJpYnV0ZSwgZGV0YWlsIHZpZXcsIHRvb2x0aXApIOKAlCBkb24ndAogIHNpbGVudGx5IGRyb3AgaW5mb3JtYXRpb24gd2l0aCBubyB3YXkgdG8gc2VlIHRoZSByZXN0LgotIE5ldmVyIGFzc3VtZSBhIG5hbWUsIHRpdGxlLCBvciBkZXNjcmlwdGlvbiBmaXRzIG9uIG9uZSBsaW5lIGF0IGFueSB3aWR0aC4KCiMjIEFjY2Vzc2liaWxpdHkKCi0gVXNlIHNlbWFudGljIEhUTUwgKGBidXR0b25gIGZvciBhY3Rpb25zLCBgYWAgZm9yIG5hdmlnYXRpb24sIG9uZSBgaDFgIHBlcgogIHBhZ2UsIHJlYWwgYGxhYmVsYC9gTGFiZWxgIGZvciBldmVyeSBmb3JtIGlucHV0KS4KLSBFdmVyeSBpbnRlcmFjdGl2ZSBlbGVtZW50IG5lZWRzIGEgdmlzaWJsZSBmb2N1cyBzdGF0ZSDigJQgZG9uJ3Qgc3RyaXAgdGhlCiAgYGZvY3VzLXZpc2libGU6cmluZy0qYCBzdHlsZXMgYWxyZWFkeSBidWlsdCBpbnRvIHRoZSBgdWkvYCBwcmltaXRpdmVzLgotIEljb24tb25seSBidXR0b25zIG5lZWQgYW4gYGFyaWEtbGFiZWxgIChvciB2aXN1YWxseS1oaWRkZW4gdGV4dCkgZGVzY3JpYmluZwogIHRoZSBhY3Rpb24sIG5vdCBqdXN0IHRoZSBpY29uLgotIE1haW50YWluIHJlYWRhYmxlIGNvbnRyYXN0IOKAlCBzdGljayB0byB0aGUgZXhpc3RpbmcgdG9rZW4gcGFpcnMKICAoYGJnLSpgL2B0ZXh0LSotZm9yZWdyb3VuZGApIHJhdGhlciB0aGFuIGludmVudGluZyBuZXcgY29sb3IgY29tYmluYXRpb25zLgotIEltYWdlcyBuZWVkIG1lYW5pbmdmdWwgYGFsdGAgdGV4dCAob3IgYGFsdD0iImAgaWYgcHVyZWx5IGRlY29yYXRpdmUpLgoKIyMgU3BhY2luZyBhbmQgdHlwb2dyYXBoeSBjb25zaXN0ZW5jeQoKLSBVc2UgdGhlIFRhaWx3aW5kIHNwYWNpbmcgc2NhbGUgKGBwLTRgLCBgZ2FwLTZgLCBgc3BhY2UteS0xLjVgLCBldGMuKSDigJQgZG9uJ3QKICBpbnZlbnQgYXJiaXRyYXJ5IHZhbHVlcyBsaWtlIGBtdC1bMTNweF1gIHVubGVzcyBtYXRjaGluZyBhbiBleGlzdGluZwogIHBpeGVsLXBlcmZlY3Qgc3BlYy4KLSBNYXRjaCBleGlzdGluZyB0eXBlIHNjYWxlIGFuZCB3ZWlnaHQgcGF0dGVybnMgYWxyZWFkeSBpbiB0aGUgY29kZWJhc2UKICAoZS5nLiBgQ2FyZFRpdGxlYCdzIGBmb250LXNlbWlib2xkIGxlYWRpbmctbm9uZSB0cmFja2luZy10aWdodGAsCiAgYENhcmREZXNjcmlwdGlvbmAncyBgdGV4dC1zbSB0ZXh0LW11dGVkLWZvcmVncm91bmRgKSBpbnN0ZWFkIG9mIHBpY2tpbmcgbmV3CiAgc2l6ZXMgcGVyIGNvbXBvbmVudC4KLSBLZWVwIGNvbnNpc3RlbnQgdmVydGljYWwgcmh5dGhtIHdpdGhpbiBhIHBhZ2Ug4oCUIHJldXNlIHRoZSBzYW1lIHNlY3Rpb24KICBzcGFjaW5nIChgc3BhY2UteS02YCwgYHB5LTZgLCBldGMuKSBhbHJlYWR5IHVzZWQgZWxzZXdoZXJlIGluIHRoYXQgYXJlYSBvZgogIHRoZSBhcHAgcmF0aGVyIHRoYW4gZXllYmFsbGluZyBuZXcgbnVtYmVycy4KCiMjIERhdGEgYW5kIFN1cGFiYXNlCgotIE5ldmVyIGludmVudCBvciBieXBhc3MgUm93IExldmVsIFNlY3VyaXR5IOKAlCB3cml0ZSBxdWVyaWVzIGFzc3VtaW5nIFJMUyBpcwogIG9uLCBhbmQgYWRkL3VwZGF0ZSBwb2xpY2llcyBvbmx5IGlmIHRoZSBpc3N1ZSBjYWxscyBmb3IgYSBzY2hlbWEgY2hhbmdlLgotIERvIG5vdCBjb21taXQgc2VjcmV0cywgYC5lbnYqYCBmaWxlcywgb3IgaGFyZGNvZGUgQVBJIGtleXMvVVJMcyDigJQgdXNlCiAgYHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDXypgIC8gc2VydmVyLW9ubHkgZW52IHZhcnMgY29uc2lzdGVudCB3aXRoIGV4aXN0aW5nCiAgdXNhZ2UuCi0gUHJlZmVyIFNlcnZlciBDb21wb25lbnRzIGFuZCBzZXJ2ZXItc2lkZSBkYXRhIGZldGNoaW5nOyBvbmx5IGFkZAogIGAidXNlIGNsaWVudCJgIHdoZXJlIGludGVyYWN0aXZpdHkgYWN0dWFsbHkgcmVxdWlyZXMgaXQuCgojIyBTY29wZSBhbmQgZGVwZW5kZW5jaWVzCgotIEltcGxlbWVudCBvbmx5IHdoYXQgdGhlIGlzc3VlIGFza3MgZm9yLiBObyB1bnJlbGF0ZWQgcmVmYWN0b3JzLCByZW5hbWVzLCBvcgogICJ3aGlsZSBJJ20gaGVyZSIgY2xlYW51cHMg4oCUIG9wZW4gYSBub3RlIGluIHRoZSBQUiBkZXNjcmlwdGlvbiBpbnN0ZWFkLgotIERvIG5vdCBhZGQgYSBuZXcgbnBtIGRlcGVuZGVuY3kgdW5sZXNzIHRoZSBpc3N1ZSBnZW51aW5lbHkgcmVxdWlyZXMKICBjYXBhYmlsaXR5IG5vdGhpbmcgaW4gYHBhY2thZ2UuanNvbmAgYWxyZWFkeSBwcm92aWRlcy4gSWYgeW91IGRvLCBleHBsYWluCiAgd2h5IGluIHRoZSBQUiBkZXNjcmlwdGlvbi4KLSBEbyBub3QgdG91Y2ggQ0kgY29uZmlnLCBlbnZpcm9ubWVudCB2YXJpYWJsZXMvc2VjcmV0cywgb3IgZGVsZXRlIGRhdGEuCi0gRG8gbm90IHJ1biBkZXN0cnVjdGl2ZSBjb21tYW5kcyAoYHJtIC1yZmAsIGZvcmNlIHB1c2hlcywgREIgZHJvcHMpLgoKIyMgRGVmaW5pdGlvbiBvZiBkb25lCgotIFsgXSBFdmVyeSBhY2NlcHRhbmNlIGNyaXRlcmlvbiBpbiB0aGUgaXNzdWUgaXMgc2F0aXNmaWVkLgotIFsgXSBMYXlvdXQgaXMgdmVyaWZpZWQgKG9yIHJlYXNvbmVkIHRocm91Z2gpIGF0IG1vYmlsZSAoMzkzcHgpLCB0YWJsZXQKICAgICAgKH43NjhweCksIGFuZCBkZXNrdG9wICh+MTI4MHB4KSB3aWR0aHMuCi0gWyBdIER5bmFtaWMvbG9uZyB0ZXh0IGNhbid0IGJyZWFrIHRoZSBsYXlvdXQgKGBicmVhay13b3Jkc2AsIGBtaW4tdy0wYCwKICAgICAgYHRydW5jYXRlYCB1c2VkIHdoZXJlIHJlbGV2YW50KS4KLSBbIF0gSW50ZXJhY3RpdmUgZWxlbWVudHMgYXJlIGtleWJvYXJkLXJlYWNoYWJsZSB3aXRoIHZpc2libGUgZm9jdXMgYW5kCiAgICAgIGNvcnJlY3QgbGFiZWxzLgotIFsgXSBOZXcgVUkgcmV1c2VzIGV4aXN0aW5nIGBjb21wb25lbnRzL3VpLypgIHByaW1pdGl2ZXMgYW5kIGRlc2lnbiB0b2tlbnMg4oCUCiAgICAgIG5vIHN0cmF5IGNvbG9ycywgYWQgaG9jIHNwYWNpbmcsIG9yIGR1cGxpY2F0ZSBjb21wb25lbnRzLgotIFsgXSBgbnBtIHJ1biBidWlsZGAgcGFzc2VzIHdpdGggbm8gZXJyb3JzIGJlZm9yZSB5b3Ugb3BlbiB0aGUgUFIuCi0gWyBdIFRoZSBjaGFuZ2UgaXMgc2NvcGVkIHRvIHRoZSBpc3N1ZTsgbm8gdW5yZWxhdGVkIGZpbGVzIHRvdWNoZWQsIG5vIG5ldwogICAgICBkZXBlbmRlbmNpZXMgdW5sZXNzIGp1c3RpZmllZCBpbiB0aGUgUFIgYm9keS4KLSBbIF0gVGhlIFBSIGRlc2NyaXB0aW9uIGV4cGxhaW5zIHdoYXQgY2hhbmdlZCwgaG93IGl0IHdhcyB2ZXJpZmllZCwgYW5kCiAgICAgIGNhbGxzIG91dCBhbnl0aGluZyBhIGh1bWFuIHN0aWxsIG5lZWRzIHRvIGRvIChlLmcuICJmaW5hbCBjb3B5IFRCRCIsCiAgICAgICJuZWVkcyBhIFN1cGFiYXNlIG1pZ3JhdGlvbiBydW4iKS4K",
  "base64",
).toString("utf8");
