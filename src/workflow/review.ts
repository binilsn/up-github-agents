#!/usr/bin/env node

// Review runner: auto-detects mode based on environment.
//
// LOCAL MODE (default):
//   Fetches a local git diff, dispatches it to the Reviewer agent, and
//   prints the validated findings.
//
// GITHUB ACTIONS MODE (when GITHUB_ACTIONS=true):
//   Dispatches the Reviewer agent which fetches the PR diff via `gh pr diff`
//   and posts a review via `gh api`.
//
// Usage — LOCAL MODE:
//   npx review                         # worktree vs HEAD
//   npx review 8592245                 # worktree vs commit
//   npx review main feature/x          # branch diff
//   npx review --format json main feature/x
//
// Usage — GITHUB ACTIONS MODE:
//   npx review
//   env: GITHUB_ACTIONS=true, PR_NUMBER=123, GH_TOKEN=xxx, AGENT_API_KEY=xxx
//
// Note: `git diff` only sees tracked changes — run `git add -N <new-file>` to
// include brand-new files in a working-tree review.
import '../lib/load-env.ts'; // MUST stay the first import — see lib/load-env.ts
import '../app.ts'; // Register custom providers (must come after load-env.ts)

import { runLocal } from './local.ts';
import { runGithub } from './github.ts';

// Each mode owns its own Flue lifecycle (start/stop) and error handling.
// No top-level finally block needed — the delegated functions clean up.

try {
  if (process.env.GITHUB_ACTIONS === 'true') {
    await runGithub();
  } else {
    await runLocal();
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
