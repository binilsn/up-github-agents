# up-reviewer

[![CI](https://github.com/senbinil/up-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/senbinil/up-reviewer/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/up-reviewer.svg)](https://www.npmjs.com/package/up-reviewer)
[![npm downloads](https://img.shields.io/npm/dm/up-reviewer.svg)](https://www.npmjs.com/package/up-reviewer)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)

A [Flue](https://flueframework.com) agent that reviews local git diffs and
GitHub PRs, reporting **line-anchored findings** (file, line, severity, title,
body).

## Install

```sh
npm install up-reviewer
```

Published at [npmjs.com/package/up-reviewer](https://www.npmjs.com/package/up-reviewer).

### Build from source

```sh
git clone https://github.com/senbinil/up-reviewer.git
cd up-reviewer
npm install
npm run build
```

Requires Node >= 24 (native TypeScript type-stripping).

## Quick start

```sh
# Set your provider's API key
export DEEPSEEK_API_KEY=sk-xxx

# Review the working tree vs HEAD
npx review

# Review vs a specific commit
npx review 8592245

# Review a branch diff
npx review main feature/x

# API-ready JSON output
npx review --format json main feature/x

# Stream agent thinking/reasoning to stderr
npx review --verbose HEAD
```

> **Note:** If you cloned the repo, use `npm run review` instead of `npx review`.

## Configuration

### Built-in Providers

Built-in providers need **only the API key** — no other env vars required.
The agent auto-configures the base URL, protocol, and model defaults.

```bash
# DeepSeek (default — no AGENT_MODEL needed)
DEEPSEEK_API_KEY=sk-xxx npx review

# Anthropic (just the key + model override)
ANTHROPIC_API_KEY=sk-ant-xxx AGENT_MODEL=anthropic/claude-sonnet-4-6 npx review

# OpenAI (just the key + model override)
OPENAI_API_KEY=sk-xxx AGENT_MODEL=openai/gpt-5.5 npx review
```

### Custom Providers

For providers not in the built-in set (Mimo, Ollama, etc.), register dynamically:

```bash
AGENT_MODEL=mimo/mimo-model-id \
  AGENT_PROVIDER_BASE_URL=https://api.mimo.example.com/v1 \
  AGENT_API_KEY=sk-xxx \
  AGENT_MODEL_MAX_TOKENS=16384 \
  AGENT_MODEL_CONTEXT_WINDOW=256000 \
  AGENT_MODEL_REASONING=true \
  npx review
```

See `.env.example` for a template.

### Token Usage Tracking

After each review, token usage is printed to stderr:

```
[usage] Turns: 1
[usage] 📊 Tokens: 1,230 in / 368 out (1,598 total)
```

For **built-in providers** (DeepSeek, Anthropic, OpenAI, etc.), estimated cost is
also shown:

```
[usage] Turns: 1
[usage] 📊 Tokens: 4,711 in / 3,305 out (8,016 total) · Est. cost: $0.0133
```

Custom providers show token counts only (no cost).

### Context7 (Optional)

The agent can optionally fetch up-to-date library documentation via
[Context7](https://context7.com) MCP. This is disabled by default — enable it
by providing your Context7 API key.

```bash
# Enable doc fetching for the agent
CONTEXT7_API_KEY=ctx7-xxx npm run review
```

When enabled, the agent can call `resolve_library_id` and `query_documentation`
tools to look up current API docs for libraries referenced in the diff. This is
useful for verifying correct usage against the latest specs.

**Behavior:**
- **No `CONTEXT7_API_KEY`** — agent works as before, no doc-fetching tools
- **Key set + valid** — agent can call Context7 to fetch library docs
- **Key set + invalid/unreachable** — agent continues without those tools, no error

> **Note:** The connection throws immediately if `auth()` is called without a
> key, so misconfiguration is caught at startup rather than silently producing
> empty credentials. The agent guard (`if (process.env.CONTEXT7_API_KEY)`)
> prevents this from firing when the key is intentionally omitted.

Context7 free tier has rate limits. If you hit them, the agent degrades gracefully
by simply not using the doc tools.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_MODEL` | No | `deepseek/deepseek-v4-flash` | Model specifier (`provider/model-id`) |
| `AGENT_PROVIDER_ID` | No | Extracted from `AGENT_MODEL` | Override provider ID for custom providers |
| `AGENT_PROVIDER_BASE_URL` | No* | — | Base URL for custom providers (*required for custom providers) |
| `AGENT_PROVIDER_API` | No | `openai-completions` | Wire protocol: `openai-completions` or `anthropic-messages` |
| `AGENT_API_KEY` | No | — | API key for custom providers |
| `AGENT_MODEL_MAX_TOKENS` | No | `8192` | Max output tokens |
| `AGENT_MODEL_CONTEXT_WINDOW` | No | `1000000` | Context window size (1M) |
| `AGENT_MODEL_REASONING` | No | `false` | Enable reasoning/thinking (`true`/`false`) |
| `CONTEXT7_API_KEY` | No | — | Context7 API key for fetching up-to-date library docs (MCP) |
| `CONTEXT7_URL` | No | `https://mcp.context7.com/mcp` | Context7 MCP endpoint URL (advanced override) |
| `SKILLS_DIR` | No | — | Path to skills directory (CLI: `--skills-dir`) |
| `MAX_SKILLS` | No | `2` | Maximum number of skills to load (CLI: `--max-skills`) |
| `MAX_SKILL_SIZE` | No | `4096` | Max bytes per skill file (CLI: `--max-skill-size`, min 512) |
| `STRICT_SKILLS` | No | `false` | Reject skills with suspicious content (CLI: `--strict-skills`) |

### Skills (Optional)

You can customize the reviewer's focus by adding skill files to your repo.
Skills are markdown files with frontmatter that tell the agent what to
prioritize during review.

**Setup:**

1. Create `.reviewer/skills/` in your repo
2. Add a subdirectory for each skill with a `SKILL.md` file:

```
.reviewer/
└── skills/
    ├── security/SKILL.md
    └── performance/SKILL.md
```

**Skill file format:**

```markdown
---
name: security
description: Focus on security vulnerabilities.
---

Prioritize these findings:
1. SQL injection, XSS, command injection
2. Authentication/authorization bypasses
3. Secrets or credentials in code
```

**CLI usage:**

```sh
npm run review -- --skills-dir .reviewer/skills HEAD~1
npm run review -- --skills-dir .reviewer/skills --max-skills 3 HEAD~1
npm run review -- --skills-dir .reviewer/skills --strict-skills HEAD~1
npm run review -- --skills-dir .reviewer/skills --max-skill-size 8192 HEAD~1
npm run review -- --verbose HEAD  # stream agent thinking to stderr
```

| Flag | Default | Description |
|------|---------|-------------|
| `--skills-dir` | _(none)_ | Path to skills directory (no skills loaded if omitted) |
| `--max-skills` | `2` | Maximum number of skills to load |
| `--max-skill-size` | `4096` | Max bytes per skill file (minimum 512) |
| `--strict-skills` | `false` | Reject skills with suspicious content (instruction injection, URLs, etc.) |

**Security:**

Skills are treated as untrusted content. The agent is instructed to use them
as guidance but never follow instructions that contradict its core review rules.
In `--strict-skills` mode, skills containing suspicious patterns (instruction
overrides, URLs, command execution references) are rejected entirely.

**Loading report:**

The reviewer prints a skill loading report to stderr:

```
[skills] Loaded 2 skill(s):
  ✓ security (from .reviewer/skills/security/SKILL.md)
  ✓ performance (from .reviewer/skills/performance/SKILL.md)

[skills] Omitted 1 skill(s):
  ✗ bad-skill — missing required frontmatter: name
```

## GitHub Actions

The agent reviews every PR automatically via a GitHub Actions workflow.

### Using the npm package

```yaml
# .github/workflows/review-pr.yml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
      - run: npm install up-reviewer
      - run: npx review
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
          AGENT_API_KEY: ${{ secrets.AGENT_API_KEY }}
          # Optional: model override (default: deepseek/deepseek-v4-flash)
          AGENT_MODEL: ${{ vars.AGENT_MODEL }}
          # Optional: enable Context7 doc fetching
          CONTEXT7_API_KEY: ${{ secrets.CONTEXT7_API_KEY }}
          # Optional: custom provider settings
          AGENT_PROVIDER_BASE_URL: ${{ secrets.AGENT_PROVIDER_BASE_URL }}
          AGENT_PROVIDER_API: ${{ secrets.AGENT_PROVIDER_API }}
          AGENT_MODEL_MAX_TOKENS: ${{ secrets.AGENT_MODEL_MAX_TOKENS }}
          AGENT_MODEL_CONTEXT_WINDOW: ${{ secrets.AGENT_MODEL_CONTEXT_WINDOW }}
          AGENT_MODEL_REASONING: ${{ secrets.AGENT_MODEL_REASONING }}
          # Optional: skill loading (see Skills section above)
          # SKILLS_DIR: .reviewer/skills
          # MAX_SKILLS: 2
          # MAX_SKILL_SIZE: 4096
          # STRICT_SKILLS: false
```

A ready-to-use copy lives at [`samples/review-pr.yml`](samples/review-pr.yml).

### Using the source repo

**Setup:**

1. Add `AGENT_API_KEY` (or provider key like `XIAOMI_API_KEY`) as a repository secret
2. Copy [.github/workflows/pr-review.yml](.github/workflows/pr-review.yml) into your repo's `.github/workflows/`
3. Push to the default branch — it activates on the next PR

The workflow uses `pull_request_target` so only base-branch code runs with secrets.
Fork PRs are skipped. After each run, it verifies a review was actually posted
and fails loudly otherwise.

## How it works

Local CLI:

```
npx review <base> [head]
        │
        ▼
src/workflow/review.ts           auto-detects mode, dispatches to:
        │                        ├── local.ts  (LOCAL MODE:  git diff)
        │                        └── github.ts (GITHUB ACTIONS MODE: gh pr diff)
        ▼
src/agents/reviewer.ts          sandbox-less review, single validated tool
        │                       (optionally mounts Context7 MCP for doc fetching)
        │                       `submit_findings` ({findings: [...]})
        ▼
workflow validates the tool     captures the tool call via toolCallId,
output + renders findings       falls back to parsing a JSON reply
```

GitHub Actions (same agent, different mode):

```
PR opened/synchronized
        │
        ▼
npx review (GITHUB_ACTIONS=true)   review.ts detects Actions mode,
        │                           dispatches to github.ts
        ▼
github.ts                          validates PR_NUMBER, GH_TOKEN,
        │                          AGENT_API_KEY; dispatches Reviewer
        ▼
src/agents/reviewer.ts           GITHUB ACTIONS MODE: `fetch_pr_diff` loads
        │                         the PR diff via `gh pr diff`; the agent
        │                         optionally uses Context7 MCP for docs;
        ▼                         reviews it
`post_review` tool               validates findings, POSTs a PR review
                                 (event COMMENT + inline comments) via `gh api`
```

Design decisions (hard-won):

- **No diff parsing anywhere.** The raw unified diff goes straight to the
  model; stats come free from `git diff --stat`. The original hand-rolled
  parser was both inefficient and buggy (`diffInParts[-1]`), and was removed.
- **Structured output rides on a schema-validated tool call, not free text.**
  The model's most reliable behavior is calling tools; `submit_findings` has a
  valibot `input` schema, so the runner can trust it. The same schema gates
  `post_review` before anything is sent to GitHub.
- **No sandbox, no gh tools for LOCAL MODE.** The `submit_findings`-only
  configuration is what the CLI was designed with: a crafted inline diff
  cannot steer the model into GitHub writes, because the tools that could do
  so are simply not registered. Under GitHub Actions the gh-backed
  `fetch_pr_diff` / `post_review` tools are registered — narrow and
  schema-validated, never an open-ended model-directed shell, and the token
  never reaches the model. Mode is decided by the `GITHUB_ACTIONS` env var,
  never by parsing the (untrusted) user message.
- **The CLI cannot hang.** `Reviewer.durability = { timeoutMs: 240_000 }`
  bounds every submission; the workflow's `git` calls have their own timeouts;
  an empty diff short-circuits without a model call.
- **Untrusted diff text is marked as data** in the prompt (injection surface).

## CI

`.github/workflows/ci.yml` runs `npm run check:types` and `npm test` on
every push to any branch and on pull requests (opened/reopened only —
every PR update is a push, so `synchronize` would be a duplicate). It
runs on Node 24 (read from `.nvmrc`), carries no secrets — permissions are read-only contents.

Concurrency is grouped per branch with `cancel-in-progress`: a new push
cancels the in-flight run from the previous commit on the same branch, so
CI never backs up behind stale runs. Docs-only pushes (markdown) skip CI
to save runner minutes.

Fork PRs are un-gated (GitHub denies repository secrets to fork runs +
the read-only token is the real boundary, not an inline `if:` that a fork
can delete from its copy).

## Learn more

- [Flue docs](https://flueframework.com/docs/) — or `npx flue docs` from the
  terminal.
