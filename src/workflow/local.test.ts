import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './local.ts';

test('parseArgs defaults to HEAD when no args', () => {
  assert.deepEqual(parseArgs([]), { base: 'HEAD', head: undefined, format: 'markdown' });
});

test('parseArgs parses base ref', () => {
  assert.deepEqual(parseArgs(['main']), { base: 'main', head: undefined, format: 'markdown' });
});

test('parseArgs parses base and head refs', () => {
  assert.deepEqual(parseArgs(['main', 'feature/x']), {
    base: 'main',
    head: 'feature/x',
    format: 'markdown',
  });
});

test('parseArgs parses --format json', () => {
  assert.deepEqual(parseArgs(['--format', 'json', 'main', 'feature/x']), {
    base: 'main',
    head: 'feature/x',
    format: 'json',
  });
});

test('parseArgs parses --format markdown', () => {
  assert.deepEqual(parseArgs(['--format', 'markdown', 'main']), {
    base: 'main',
    head: undefined,
    format: 'markdown',
  });
});

test('parseArgs handles --format at the end', () => {
  assert.deepEqual(parseArgs(['main', 'feature/x', '--format', 'json']), {
    base: 'main',
    head: 'feature/x',
    format: 'json',
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
  });
});

test('parseArgs defaults to HEAD when only positional is commit sha', () => {
  assert.deepEqual(parseArgs(['8592245']), {
    base: '8592245',
    head: undefined,
    format: 'markdown',
  });
});
