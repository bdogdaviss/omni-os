# Coding agent setup (per client repo)

Omni OS publishes a GitHub **issue** from a build task. This setup lets you turn
that issue into **code + a pull request** with one click in Omni OS.

## How it works

```
Omni OS: publish issue        → real GitHub issue created        (GATE 1: you approve the spec)
Omni OS: "Build with agent"   → adds the "agent:build" label
GitHub Action: Claude Code    → reads issue, writes code, opens a Pull Request
You on GitHub: review + merge → code reaches the repo            (GATE 2: you approve the code)
```

Omni OS never writes code itself. The agent runs inside the **repo's GitHub
Actions**, and its work only lands when you merge the pull request.

## Set these ONCE for your whole account (not per repo)

Do these two at the **organization/account** level and every current and future
repo inherits them — you never touch them again:

- **Anthropic API key.** GitHub → your org/account → Settings → Secrets and
  variables → Actions → **New organization secret** named `ANTHROPIC_API_KEY`.
  (For a personal account, set it once and grant it to your repos.) This means
  no per-repo secret step, ever.
- **Let Actions open PRs.** GitHub → your org/account → Settings → Actions →
  General → Workflow permissions → enable **"Allow GitHub Actions to create and
  approve pull requests."** Applies to all repos under the account.

Omni OS creates the `agent:build` **label automatically** when you dispatch, so
there is no label step.

## Per repo: only the workflow file

The one genuinely per-repo thing is the workflow file itself. Best options, in
order of least effort:

1. **Template repo (zero setup).** Put `.github/workflows/claude-issue-to-pr.yml`
   and a `CLAUDE.md` in a GitHub **template repository**, then create every new
   client repo "from template." New repos are agent-ready the moment they exist.
2. **Copy it in once** when you start a client repo:
   ```bash
   mkdir -p .github/workflows
   cp coding-agent-setup/claude-issue-to-pr.yml .github/workflows/
   cp coding-agent-setup/CLAUDE.md.template CLAUDE.md   # then fill it in
   git add .github/workflows/claude-issue-to-pr.yml CLAUDE.md
   git commit -m "Add Omni OS coding-agent workflow" && git push
   ```
3. **Let Omni OS push it** — possible, but requires granting the GitHub App
   `Contents: write` + `Workflows: write`. See "Automating the workflow file"
   below before deciding.

## Automating the workflow file (optional)

If you don't want to use a template repo, Omni OS can push the workflow file for
you when you connect a repo — but only if you widen the GitHub App's permissions
to include **Contents: write** and **Workflows: write** (needed to write files
under `.github/workflows/`). That's a real increase in what the App can do to
your code, so it's a deliberate choice, not a default. A template repo avoids it
entirely.

## Using it

1. In Omni OS, open a published issue draft's Publish page.
2. Click **Build with coding agent → Confirm build**.
3. Omni OS labels the issue `agent:build`; the repo's Action starts.
4. Watch it under the repo's **Actions** tab; a **pull request** appears when done.
5. Review the PR, request changes if needed, and merge.

## Notes

- Cost: a well-scoped issue is typically a few cents to ~$2 of Anthropic API
  usage per run, billed to the key you set in step 2.
- The agent only triggers on the `agent:build` label, so re-labeling (or Omni
  OS dispatching again) re-runs it. Remove the label between runs if you want to
  avoid accidental re-triggers.
- Exact `anthropics/claude-code-action` input names can change between versions;
  if a run fails at the "Run Claude Code" step, check that action's README and
  update `claude-issue-to-pr.yml` accordingly.
