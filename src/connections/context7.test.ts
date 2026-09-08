import assert from 'node:assert/strict';
import { test } from 'node:test';

import { context7, context7ToolNames } from './context7.ts';

test('context7 connection has correct name and default URL', () => {
  assert.equal(context7.name, 'context7');
  assert.equal(context7.url, 'https://mcp.context7.com/mcp');
});

test('context7 connection is optional', () => {
  assert.equal(context7.optional, true);
});

test('context7 connection exposes resolve_library_id and query_documentation tools', () => {
  assert.deepEqual(context7.tools, ['resolve_library_id', 'query_documentation']);
});

test('context7 auth returns CONTEXT7_API_KEY when set', () => {
  const original = process.env.CONTEXT7_API_KEY;
  try {
    process.env.CONTEXT7_API_KEY = 'test-key-123';
    const auth = context7.auth;
    assert.equal(typeof auth, 'function');
    assert.equal((auth as () => string)(), 'test-key-123');
  } finally {
    if (original === undefined) {
      delete process.env.CONTEXT7_API_KEY;
    } else {
      process.env.CONTEXT7_API_KEY = original;
    }
  }
});

test('context7 auth throws when CONTEXT7_API_KEY is missing', () => {
  const original = process.env.CONTEXT7_API_KEY;
  try {
    delete process.env.CONTEXT7_API_KEY;
    const auth = context7.auth;
    assert.equal(typeof auth, 'function');
    assert.throws(() => (auth as () => string)(), {
      message: /CONTEXT7_API_KEY is not set/,
    });
  } finally {
    if (original !== undefined) {
      process.env.CONTEXT7_API_KEY = original;
    }
  }
});

test('context7ToolNames derives MCP tool names from config', () => {
  assert.deepEqual(context7ToolNames, [
    'mcp__context7__resolve_library_id',
    'mcp__context7__query_documentation',
  ]);
});
