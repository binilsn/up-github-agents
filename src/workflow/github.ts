// GitHub Actions mode: dispatches the Reviewer agent which fetches the PR diff
// via `gh pr diff` and posts a review via `gh api`.
//
// Usage:
//   npx review
//   env: GITHUB_ACTIONS=true, PR_NUMBER=123, GH_TOKEN=xxx, AGENT_API_KEY=xxx
//
// Required environment variables (set by the workflow):
//   GITHUB_ACTIONS=true
//   PR_NUMBER — the pull request number
//   GH_TOKEN — GitHub token for API access
//   AGENT_API_KEY — model provider API key

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { init } from '@flue/runtime';
import { start } from '@flue/runtime/node';

import { Reviewer } from '../agents/reviewer.ts';
import db from '../db.ts';
import { trackTools } from './tool-tracker.ts';
import { setupUsageCollector } from '../lib/usage.ts';
import { renderUsage } from '../lib/render.ts';

const execFileAsync = promisify(execFile);

export async function runGithub(): Promise<void> {
  let flue: Awaited<ReturnType<typeof start>> | undefined;
  let unobserve: (() => void) | undefined;
  try {
    const prNumber = process.env.PR_NUMBER;
    if (!prNumber) {
      throw new Error(
        'PR_NUMBER environment variable is required. ' +
        'Set it in your GitHub Actions workflow from github.event.pull_request.number.'
      );
    }
    if (!/^[1-9]\d*$/.test(prNumber)) {
      throw new Error(
        `PR_NUMBER must be a positive integer, got "${prNumber}".`
      );
    }

    if (!process.env.GH_TOKEN) {
      throw new Error(
        'GH_TOKEN environment variable is required. ' +
        'Set it in your GitHub Actions workflow: ${{ secrets.GITHUB_TOKEN }}.'
      );
    }

    if (!process.env.AGENT_API_KEY) {
      throw new Error(
        'AGENT_API_KEY environment variable is required. ' +
        'Set it in your GitHub Actions workflow from repository secrets.'
      );
    }

    flue = await start({ agents: [Reviewer], db });

    const { collector: usageCollector, unobserve: detachUsage } = setupUsageCollector();
    unobserve = detachUsage;

    const handle = init(Reviewer);

    const message = [
      `Review pull request #${prNumber}.`,
      '',
      'Call `fetch_pr_diff` with the PR number to load the diff, then review it,',
      'then call `post_review` with your findings.',
    ].join('\n');

    const tracker = trackTools('post_review');
    const receipt = await handle.dispatch(message);
    const reply = await handle.read(receipt, { onEvent: tracker.onEvent });

    if (!tracker.outputs.size) {
      throw new Error(
        'Agent did not call post_review.' +
          (reply.text ? '\n' + reply.text : '')
      );
    }

    const u = usageCollector.summary();
    if (u.turns > 0) {
      const usageLine = renderUsage(u);
      console.error(`[usage] Turns: ${u.turns}`);
      console.error(`[usage] ${usageLine}`);

      // Post usage as a PR comment after the review
      try {
        await execFileAsync(
          'gh',
          ['api', `repos/{owner}/{repo}/issues/${prNumber}/comments`, '--method', 'POST', '-f', `body=${usageLine}`],
          { timeout: 30_000 },
        );
      } catch (e) {
        console.warn('[usage] failed to post usage comment:', e);
      }
    }
  } finally {
    unobserve?.();
    await flue?.stop();
  }
}
