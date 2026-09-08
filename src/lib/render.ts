// Shared rendering for review findings. The output shapes are driven by
// plain-text templates in templates/ (review.summary.md, review.finding.md,
// review.comment.md) so formatting can be edited without touching code.
// Placeholders are {{key}}; unknown placeholders render empty. The summary
// template must contain {{findings}} — it is replaced with the finding
// blocks joined by blank lines. Used by the local CLI workflow and by the
// agent's post_review tool so both produce identical output.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReviewFinding } from '../types/review.ts';
import type { UsageSummary } from './usage.ts';

const SEVERITY_HEADING: Record<ReviewFinding['severity'], string> = {
  high: '🔴 High',
  medium: '🟠 Medium',
  low: '🟡 Low',
};

// Strip terminal control characters from model-produced text before printing:
// a crafted diff could steer the model into echoing ANSI/OSC escape sequences
// into a finding, which the terminal would then interpret. Keep \n and \t
// (multi-line finding bodies must survive); strip CR and everything else.
export function sanitize(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
}

// Strips terminal control characters, but unlike `sanitize` also removes
// newlines, tabs, and backticks — for contexts where multi-line text or
// markdown code markers are never valid (file paths, anchors).
function sanitizePath(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F`]/g, '');
}

export interface ReviewTemplates {
  /** Whole-report shape; must contain {{findings}}. */
  summary: string;
  /** Per-finding block, repeated inside {{findings}}. */
  finding: string;
  /** Per-finding GitHub inline-comment body. */
  comment: string;
  /** Rendering for the case when no findings were reported. */
  clean: string;
}

function templateFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8');
}

let cachedTemplates: ReviewTemplates | undefined;

/** Load the response templates from templates/, cached for the process lifetime. */
export function loadTemplates(): ReviewTemplates {
  cachedTemplates ??= (() => {
    const t: ReviewTemplates = {
      summary: templateFile('review.summary.md'),
      finding: templateFile('review.finding.md'),
      comment: templateFile('review.comment.md'),
      clean:  templateFile('review.clean.md'),
    };
    // Guard against mis-edited templates: the summary must contain
    // exactly one {{findings}} so the two-pass render in toMarkdown
    // can insert the finding blocks without dropping or leaking them.
    const count = t.summary.match(/{{\s*findings\s*}}/g)?.length ?? 0;
    if (count !== 1) {
      throw new Error(
        `templates/review.summary.md must contain exactly one {{findings}} ` +
        `placeholder (found ${count}). Edit the template so {{findings}} ` +
        `appears where the finding blocks should go, then restart.`,
      );
    }
    return t;
  })();
  return cachedTemplates;
}

/** Substitute {{key}} placeholders; unknown keys render empty. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key: string) =>
    values[key] ?? '',
  );
}

function countBySeverity(findings: ReviewFinding[]): Record<ReviewFinding['severity'], number> {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  return bySeverity;
}

/**
 * Values available to the finding and comment templates. Model-produced text
 * (file, title, body) is sanitized here so a crafted diff cannot inject
 * control characters through the template output.
 */
function findingValues(f: ReviewFinding): Record<string, string> {
  const file = sanitizePath(f.file);
  return {
    severity_label: SEVERITY_HEADING[f.severity],
    severity: f.severity,
    file,
    line: f.line !== undefined ? String(f.line) : '',
    anchor: f.line !== undefined ? `\`${file}:${f.line}\`` : `\`${file}\``,
    title: sanitize(f.title),
    body: sanitize(f.body),
  };
}

/** GitHub-flavored markdown, paste-able into a PR comment. */
export function toMarkdown(
  findings: ReviewFinding[],
  templates: ReviewTemplates = loadTemplates(),
): string {
  if (findings.length === 0) return templates.clean;
  const bySeverity = countBySeverity(findings);
  const blocks = findings.map((f) => fill(templates.finding, findingValues(f))).join('\n\n');
  // Two-pass substitution to avoid double-scanning the model-produced text
  // inside {{findings}}: first fill the summary counts plus a sentinel in
  // {{findings}}, then literal-replace the sentinel with the rendering
  // blocks — no regex, so {{placeholders}} inside model text are preserved.
  const header = fill(templates.summary, {
    count: String(findings.length),
    high: String(bySeverity.high),
    medium: String(bySeverity.medium),
    low: String(bySeverity.low),
    findings: '\x00FINDINGS\x00',
  });
  return header.replace('\x00FINDINGS\x00', blocks);
}

export interface GitHubComment {
  body: string;
  path: string;
  line: number;
}

/** { summary, comments } shaped for GitHub PR commenting / scripting. */
export function toJson(
  findings: ReviewFinding[],
  templates: ReviewTemplates = loadTemplates(),
): { summary: string; comments: GitHubComment[] } {
  const comments: GitHubComment[] = [];
  for (const f of findings) {
    if (f.line === undefined) continue; // file-level findings go in the summary
    comments.push({
      body: fill(templates.comment, findingValues(f)),
      // Sanitize the path with the strict variant (no newlines/tabs/backticks):
      // a control character in a model-produced file path would 422 the whole
      // review from the API side.
      path: sanitizePath(f.file),
      line: f.line,
    });
  }
  return { summary: toMarkdown(findings, templates), comments };
}

/** Compact markdown line for terminal or PR body footer. */
export function renderUsage(u: UsageSummary): string {
  let line =
    `📊 Tokens: ${u.inputTokens.toLocaleString('en-US')} in / ${u.outputTokens.toLocaleString('en-US')} out` +
    ` (${u.totalTokens.toLocaleString('en-US')} total)`;

  if (u.estimatedCostUsd > 0) {
    line += ` · Est. cost: $${u.estimatedCostUsd.toFixed(4)}`;
  }

  return line;
}
