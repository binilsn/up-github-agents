/**
 * Token usage collector for Flue agent reviews.
 *
 * Captures cumulative token counts and estimated cost from model turn events
 * using the Flue `observe()` API. Designed to be registered once per workflow
 * run and queried after the review completes.
 *
 * Usage:
 *   import { observe } from '@flue/runtime';
 *   import { createUsageCollector } from './usage.ts';
 *
 *   const collector = createUsageCollector();
 *   observe(collector.observe);
 *
 *   // ... run the review ...
 *
 *   console.log(collector.summary());
 */
import type { FlueObservation, PromptUsage } from "@flue/runtime";
import { observe } from "@flue/runtime";

export interface UsageSummary {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    turns: number;
}

export interface UsageCollector {
    /** Flue event subscriber — pass to `observe(collector.observe)`. */
    observe(event: FlueObservation): void;
    /** Returns the accumulated usage summary. */
    summary(): UsageSummary;
    /** Resets all counters to zero. */
    reset(): void;
}

const EMPTY: UsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    turns: 0,
};

/** Create a stateful usage accumulator. */
export function createUsageCollector(): UsageCollector {
    const totals = { ...EMPTY };

    return {
        observe: (event) => {
            if (
                event.type !== "turn" ||
                !("response" in event) ||
                !event.response?.usage
            )
                return;
            const u: PromptUsage = event.response.usage;
            totals.inputTokens += u.input;
            totals.outputTokens += u.output;
            totals.cacheReadTokens += u.cacheRead;
            totals.cacheWriteTokens += u.cacheWrite;
            totals.totalTokens += u.totalTokens;
            totals.estimatedCostUsd += u.cost.total;
            totals.turns++;
        },

        summary() {
            return { ...totals };
        },

        reset() {
            Object.assign(totals, EMPTY);
        },
    };
}

/** Create a usage collector and attach it to Flue's observe() API. */
export function setupUsageCollector(): {
  collector: UsageCollector;
  unobserve: () => void;
} {
  const collector = createUsageCollector();
  let unobserveFn: (() => void) | undefined;
  try {
    unobserveFn = observe(collector.observe);
  } catch (e) {
    console.warn('[usage] observer attach failed:', e);
  }
  return {
    collector,
    unobserve: () => unobserveFn?.(),
  };
}
