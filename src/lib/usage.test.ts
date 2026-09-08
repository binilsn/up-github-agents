import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createUsageCollector } from './usage.ts';
import type { FlueObservation } from '@flue/runtime';

function turnEvent(usage: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  costTotal?: number;
}): FlueObservation {
  return {
    v: 3,
    eventIndex: 0,
    timestamp: new Date().toISOString(),
    type: 'turn',
    turnId: 't1',
    purpose: 'agent',
    durationMs: 100,
    request: {} as any,
    response: {
      usage: {
        input: usage.input ?? 0,
        output: usage.output ?? 0,
        cacheRead: usage.cacheRead ?? 0,
        cacheWrite: usage.cacheWrite ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: usage.costTotal ?? 0,
        },
      },
    },
    isError: false,
  } as unknown as FlueObservation;
}

test('summary starts at zero', () => {
  const c = createUsageCollector();
  const s = c.summary();
  assert.equal(s.inputTokens, 0);
  assert.equal(s.outputTokens, 0);
  assert.equal(s.totalTokens, 0);
  assert.equal(s.estimatedCostUsd, 0);
  assert.equal(s.turns, 0);
});

test('accumulates a single turn', () => {
  const c = createUsageCollector();
  c.observe(turnEvent({ input: 1000, output: 200, totalTokens: 1200, costTotal: 0.003 }));
  const s = c.summary();
  assert.equal(s.inputTokens, 1000);
  assert.equal(s.outputTokens, 200);
  assert.equal(s.totalTokens, 1200);
  assert.equal(s.estimatedCostUsd, 0.003);
  assert.equal(s.turns, 1);
});

test('accumulates multiple turns', () => {
  const c = createUsageCollector();
  c.observe(turnEvent({ input: 1000, output: 200, totalTokens: 1200, costTotal: 0.003 }));
  c.observe(turnEvent({ input: 800, output: 300, totalTokens: 1100, costTotal: 0.005 }));
  const s = c.summary();
  assert.equal(s.inputTokens, 1800);
  assert.equal(s.outputTokens, 500);
  assert.equal(s.totalTokens, 2300);
  assert.equal(s.estimatedCostUsd, 0.008);
  assert.equal(s.turns, 2);
});

test('accumulates cache tokens', () => {
  const c = createUsageCollector();
  c.observe(turnEvent({ cacheRead: 500, cacheWrite: 100 }));
  c.observe(turnEvent({ cacheRead: 300, cacheWrite: 0 }));
  const s = c.summary();
  assert.equal(s.cacheReadTokens, 800);
  assert.equal(s.cacheWriteTokens, 100);
});

test('ignores non-turn events', () => {
  const c = createUsageCollector();
  c.observe({
    v: 3,
    eventIndex: 0,
    timestamp: new Date().toISOString(),
    type: 'tool_start',
  } as unknown as FlueObservation);
  assert.equal(c.summary().turns, 0);
});

test('ignores turn events without usage', () => {
  const c = createUsageCollector();
  c.observe({
    v: 3,
    eventIndex: 0,
    timestamp: new Date().toISOString(),
    type: 'turn',
    turnId: 't1',
    purpose: 'agent',
    durationMs: 100,
    request: {} as any,
    response: {},
    isError: true,
  } as unknown as FlueObservation);
  assert.equal(c.summary().turns, 0);
});

test('reset clears all counters', () => {
  const c = createUsageCollector();
  c.observe(turnEvent({ input: 1000, output: 200, totalTokens: 1200, costTotal: 0.003 }));
  c.reset();
  const s = c.summary();
  assert.equal(s.inputTokens, 0);
  assert.equal(s.outputTokens, 0);
  assert.equal(s.cacheReadTokens, 0);
  assert.equal(s.cacheWriteTokens, 0);
  assert.equal(s.totalTokens, 0);
  assert.equal(s.estimatedCostUsd, 0);
  assert.equal(s.turns, 0);
});

test('summary returns a copy, not a reference', () => {
  const c = createUsageCollector();
  c.observe(turnEvent({ input: 1000, output: 200, totalTokens: 1200, costTotal: 0.003 }));
  const s1 = c.summary();
  const s2 = c.summary();
  assert.deepEqual(s1, s2);
  assert.notEqual(s1, s2);
  s1.inputTokens = 999;
  assert.equal(c.summary().inputTokens, 1000);
});
