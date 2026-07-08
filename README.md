# Omni OS

Omni OS is the internal operating system for **Omni Strive**, a software agency.
It turns a messy client inquiry into everything needed to scope, sell, and start
building the work — each step driven by an AI agent, with a human approving
between stages.

## The pipeline

```
Client intake ──▶ Project brief ──▶ Proposal ──▶ Build tasks ──▶ GitHub issue drafts ──▶ dispatch coding agent
                                        │
                                        └────────▶ Launch checklist
```

Each arrow is an API route under [`app/api/agents/`](app/api/agents) backed by a
model call:

- **Intake** — raw client message + contact details → a clean internal brief
  (project type, MVP vs. future features, questions to ask, complexity).
- **Proposal** — a brief → three costed tiers (Lean MVP / Core Build / Full
  Launch) with scope, assumptions, and a draft follow-up message.
- **Build tasks** — an approved proposal → small, single-PR-sized tasks, each
  scoped to one architectural layer so a coding agent can implement it.
- **GitHub issue draft** — a build task → a developer-ready issue (summary,
  requirements, acceptance criteria, labels).
- **Launch checklist** — an approved proposal + its tasks → a launch-readiness
  checklist with verification steps.

The GitHub integration (a GitHub App) can sync repos, publish issues, and
dispatch an autonomous coding agent against them. Clients, projects, notes, and
an activity log round out the app; every table is row-level-secured to its
owner.

## Stack

- **Next.js** (App Router, React 19) on Vercel
- **Supabase** — Postgres + Auth, with RLS on every table (`auth.uid() = user_id`)
- **Anthropic Claude** (Haiku by default) with an **OpenAI failover** — see
  [`lib/ai/generate.ts`](lib/ai/generate.ts)
- **Tailwind CSS + shadcn/ui**, **zod** for validation, **libsodium** for
  encrypting stored GitHub secrets

### The AI layer

All agents go through [`generateStructured`](lib/ai/generate.ts), which forces
the model to return JSON matching a zod schema (via tool use / function calling)
and validates it before use — no parsing raw model text. If Claude is
unavailable for billing reasons (out of credits, over the spend cap, rate
limited, overloaded), the same request automatically fails over to OpenAI.

## Setup

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local         # then fill in the values below
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon/publishable key |
| `ANTHROPIC_API_KEY` | ✅¹ | Claude access (primary provider) |
| `OPENAI_API_KEY` | ✅¹ | OpenAI access (failover when Claude is down) |
| `ANTHROPIC_MODEL` | — | Override the default `claude-haiku-4-5-20251001` |
| `OPENAI_FALLBACK_MODEL` | — | Override the default `gpt-4o-mini` |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_SLUG` | — | GitHub App credentials (for the GitHub features) |
| `GITHUB_WEBHOOK_SECRET` | — | Verifies incoming GitHub webhooks |
| `GITHUB_AGENT_ANTHROPIC_KEY` | — | Key handed to dispatched coding agents |
| `GITHUB_REAL_PUBLISHING_ENABLED` | — | Gate that must be on to write to real GitHub repos |

¹ At least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` must be set; set both
for automatic failover.

### Database

The schema lives in [`supabase/migrations/`](supabase/migrations). To stand up a
database, link the Supabase CLI to a project and apply the migrations — see
[`supabase/README.md`](supabase/README.md) for the exact commands and the schema
capture/change workflow.

## Development conventions

Contributor and agent conventions live in [`AGENTS.md`](AGENTS.md) (`CLAUDE.md`
is a symlink to it). Non-trivial logic ships with one runnable check next to it —
e.g. [`lib/ai/generate.check.ts`](lib/ai/generate.check.ts),
[`lib/duplicates/normalize.check.ts`](lib/duplicates/normalize.check.ts) — run
directly with `node <path>` (Node strips the TypeScript).

```bash
npm run build   # production build
npm run lint     # eslint
```
