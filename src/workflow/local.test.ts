import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

// Save and restore MAX_SKILL_SIZE so tests are deterministic regardless of .env
const savedMaxSkillSize = process.env.MAX_SKILL_SIZE;
process.env.MAX_SKILL_SIZE = '4096';

import { parseArgs } from './local.ts';

after(() => {
  if (savedMaxSkillSize === undefined) {
    delete process.env.MAX_SKILL_SIZE;
  } else {
    process.env.MAX_SKILL_SIZE = savedMaxSkillSize;
  }
});

const defaultSkills = {
  skillsDir: undefined,
  maxSkills: 2,
  strictSkills: false,
  maxSkillSize: 4096,
};

test('parseArgs defaults to HEAD when no args', () => {
  assert.deepEqual(parseArgs([]), { base: 'HEAD', head: undefined, format: 'markdown', skills: defaultSkills, verbose: false });
});

test('parseArgs parses base ref', () => {
  assert.deepEqual(parseArgs(['main']), { base: 'main', head: undefined, format: 'markdown', skills: defaultSkills, verbose: false });
});

test('parseArgs parses base and head refs', () => {
  assert.deepEqual(parseArgs(['main', 'feature/x']), {
    base: 'main',
    head: 'feature/x',
    format: 'markdown',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs parses --format json', () => {
  assert.deepEqual(parseArgs(['--format', 'json', 'main', 'feature/x']), {
    base: 'main',
    head: 'feature/x',
    format: 'json',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs parses --format markdown', () => {
  assert.deepEqual(parseArgs(['--format', 'markdown', 'main']), {
    base: 'main',
    head: undefined,
    format: 'markdown',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs handles --format at the end', () => {
  assert.deepEqual(parseArgs(['main', 'feature/x', '--format', 'json']), {
    base: 'main',
    head: 'feature/x',
    format: 'json',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs throws on unknown format', () => {
  assert.throws(
    () => parseArgs(['--format', 'yaml']),
    /unknown --format "yaml"/,
  );
});

test('parseArgs defaults to HEAD when only --format is given', () => {
  assert.deepEqual(parseArgs(['--format', 'json']), {
    base: 'HEAD',
    head: undefined,
    format: 'json',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs defaults to HEAD when only positional is commit sha', () => {
  assert.deepEqual(parseArgs(['8592245']), {
    base: '8592245',
    head: undefined,
    format: 'markdown',
    skills: defaultSkills,
    verbose: false,
  });
});

test('parseArgs parses --skills-dir', () => {
  const result = parseArgs(['--skills-dir', '.reviewer/skills', 'main']);
  assert.deepEqual(result.skills.skillsDir, '.reviewer/skills');
  assert.deepEqual(result.base, 'main');
});

test('parseArgs parses --max-skills', () => {
  const result = parseArgs(['--max-skills', '5']);
  assert.deepEqual(result.skills.maxSkills, 5);
});

test('parseArgs parses --strict-skills', () => {
  const result = parseArgs(['--strict-skills']);
  assert.deepEqual(result.skills.strictSkills, true);
});

test('parseArgs parses --max-skill-size', () => {
  const result = parseArgs(['--max-skill-size', '8192']);
  assert.deepEqual(result.skills.maxSkillSize, 8192);
});

test('parseArgs parses --verbose', () => {
  const result = parseArgs(['--verbose']);
  assert.deepEqual(result.verbose, true);
});

test('parseArgs throws on missing --skills-dir value', () => {
  assert.throws(() => parseArgs(['--skills-dir']), /--skills-dir requires a path argument/);
});

test('parseArgs throws on missing --max-skills value', () => {
  assert.throws(() => parseArgs(['--max-skills']), /--max-skills requires a number argument/);
});

test('parseArgs throws on non-integer --max-skills', () => {
  assert.throws(() => parseArgs(['--max-skills', '2.5']), /--max-skills must be a positive integer/);
});

test('parseArgs throws on missing --max-skill-size value', () => {
  assert.throws(() => parseArgs(['--max-skill-size']), /--max-skill-size requires a number argument/);
});

test('parseArgs throws on --max-skill-size below minimum', () => {
  assert.throws(() => parseArgs(['--max-skill-size', '100']), /--max-skill-size must be 512-65536/);
});

test('parseArgs throws on --max-skill-size above maximum', () => {
  assert.throws(() => parseArgs(['--max-skill-size', '100000']), /--max-skill-size must be 512-65536/);
});
