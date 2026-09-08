import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve, isAbsolute, relative } from 'node:path';
import matter from 'gray-matter';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  description: string;
  content: string;
}

export interface SkillReport {
  loaded: Array<{ name: string; path: string }>;
  omitted: Array<{ name: string; reason: string }>;
}

export interface DiscoverOptions {
  dir: string;
  maxSkills: number;
  strict: boolean;
  maxSkillSize?: number;
  /** Base directory for path traversal check. Defaults to cwd. */
  baseDir?: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    reason: 'Possible instruction override attempt',
  },
  {
    pattern: /<\/SKILL>/gi,
    reason: 'Contains XML closing tag (possible prompt injection)',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above)/gi,
    reason: 'Possible instruction override attempt',
  },
  {
    pattern: /you\s+are\s+now\s+(a|an)\s+/gi,
    reason: 'Possible persona hijack attempt',
  },
  {
    pattern: /new\s+(system\s+)?instructions/gi,
    reason: 'Possible instruction override attempt',
  },
  {
    pattern: /override\s+(your|the)\s+(system|original|previous)/gi,
    reason: 'Possible instruction override attempt',
  },
  {
    pattern: /call\s+(bash|exec|write|edit|delete)\s+/gi,
    reason: 'References non-review tools',
  },
  {
    pattern: /run\s+(a\s+)?(command|script|shell)/gi,
    reason: 'Possible command execution attempt',
  },
  { pattern: /https?:\/\/[^\s]+/gi, reason: 'Contains URLs' },
  { pattern: /atob\s*\(/gi, reason: 'Calls atob() decoding' },
  { pattern: /base64[_-]?decode/gi, reason: 'Calls base64 decode' },
  { pattern: /curl\s+/gi, reason: 'References HTTP client' },
  {
    pattern:
      /submit_findings\s*\(\s*\{\s*findings:\s*\[\]\s*\}\s*\)/gi,
    reason: 'Attempts to force empty findings',
  },
];

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateSkillContent(
  name: string,
  content: string,
): ValidationResult {
  const warnings: string[] = [];

  for (const { pattern, reason } of SUSPICIOUS_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      warnings.push(`[${name}] ${reason}`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export function validateSkillsDir(dir: string, baseDir?: string): string | null {
  const resolved = resolve(dir);
  const base = resolve(baseDir ?? '.');
  // Prevent path traversal: resolved path must stay within base
  if (!resolved.startsWith(base + '/') && resolved !== base) {
    return null;
  }
  return resolved;
}

/**
 * Escape XML special characters to prevent prompt injection via skill content
 * embedded in XML tags.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Discovery ───────────────────────────────────────────────────────────────

export function discoverSkills(options: DiscoverOptions): {
  skills: Skill[];
  report: SkillReport;
} {
  // 4KB default: enough for focused agent skills, limits prompt injection surface.
  // Override via --max-skill-size or MAX_SKILL_SIZE env var.
  const { dir, maxSkills, strict, baseDir, maxSkillSize = 4096 } = options;
  const report: SkillReport = { loaded: [], omitted: [] };
  const skills: Skill[] = [];

  const resolvedDir = validateSkillsDir(dir, baseDir ?? process.cwd());
  if (!resolvedDir || !existsSync(resolvedDir)) {
    return { skills, report };
  }

  let entries: string[];
  try {
    entries = readdirSync(resolvedDir)
      .filter((entry) => {
        const fullPath = join(resolvedDir, entry);
        return lstatSync(fullPath).isDirectory();
      })
      .sort(); // alphabetical for deterministic collision resolution
  } catch {
    return { skills, report };
  }

  const seenNames = new Set<string>();

  for (const entry of entries) {
    if (skills.length >= maxSkills) {
      report.omitted.push({
        name: entry,
        reason: `max-skills limit (${maxSkills}) reached`,
      });
      continue;
    }

    const skillPath = join(resolvedDir, entry, 'SKILL.md');
    const relPath = relative('.', skillPath);

    if (!existsSync(skillPath)) {
      report.omitted.push({
        name: entry,
        reason: 'missing SKILL.md',
      });
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(skillPath, 'utf8');
    } catch {
      report.omitted.push({
        name: entry,
        reason: 'unreadable file',
      });
      continue;
    }

    if (raw.length > maxSkillSize) {
      report.omitted.push({
        name: entry,
        reason: `exceeds ${maxSkillSize} byte limit (${raw.length} bytes)`,
      });
      continue;
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch {
      report.omitted.push({
        name: entry,
        reason: 'invalid frontmatter',
      });
      continue;
    }

    const { name, description } = parsed.data as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      report.omitted.push({
        name: entry,
        reason: 'missing required frontmatter: name',
      });
      continue;
    }

    if (typeof description !== 'string' || !description.trim()) {
      report.omitted.push({
        name: entry,
        reason: 'missing required frontmatter: description',
      });
      continue;
    }

    // Name collision: warn, load first (alphabetical)
    if (seenNames.has(name)) {
      report.omitted.push({
        name: entry,
        reason: `duplicate skill name "${name}" (first wins)`,
      });
      continue;
    }

    // Security scan
    const validation = validateSkillContent(name, parsed.content);
    if (!validation.valid) {
      if (strict) {
        report.omitted.push({
          name: entry,
          reason: `security scan failed: ${validation.warnings.join('; ')}`,
        });
        continue;
      }
      // Lenient mode: log warnings but still load
      for (const w of validation.warnings) {
        console.error(`[skills] warning: ${w}`);
      }
    }

    seenNames.add(name);
    skills.push({
      name,
      description,
      content: parsed.content.trim(),
    });
    report.loaded.push({ name, path: relPath });
  }

  return { skills, report };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export function printSkillReport(report: SkillReport): void {
  const { loaded, omitted } = report;

  if (loaded.length > 0) {
    console.error(`[skills] Loaded ${loaded.length} skill(s):`);
    for (const { name, path } of loaded) {
      console.error(`  ✓ ${name} (from ${path})`);
    }
  } else {
    console.error('[skills] No skills loaded.');
  }

  if (omitted.length > 0) {
    console.error(`\n[skills] Omitted ${omitted.length} skill(s):`);
    for (const { name, reason } of omitted) {
      console.error(`  ✗ ${name} — ${reason}`);
    }
  }
}
