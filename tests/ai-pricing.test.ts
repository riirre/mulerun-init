import { describe, expect, it } from 'vitest';

import type { Env } from '../functions/types';
import {
  normaliseUsage,
  extractUsageAndCost,
  resolveCostWithMarkup,
  applyMarkupToCost,
} from '../functions/api/ai';

function createEnv(multiplier?: string): Env {
  return {
    AGENT_KEY: 'test-agent-key',
    AGENT_ID: 'test-agent',
    MULERUN_API_KEY: 'test-api',
    METERING_ENDPOINT: 'https://example.com/metering',
    PRICING_MARKUP_MULTIPLIER: multiplier,
    NONCE_KV_INIT: {
      get: async () => null,
      put: async () => {},
    },
  } as Env;
}

describe('usage normalisation', () => {
  it('collects Anthropic-style token fields', () => {
    const usage = normaliseUsage({
      input_tokens: 12,
      output_tokens: 7,
    });

    expect(usage.promptTokens).toBe(12);
    expect(usage.completionTokens).toBe(7);
    expect(usage.totalTokens).toBe(19);
  });

  it('falls back to combined total when provided', () => {
    const usage = normaliseUsage({
      prompt_tokens: 4,
      completion_tokens: 5,
      total_tokens: 20,
    });

    expect(usage.promptTokens).toBe(4);
    expect(usage.completionTokens).toBe(5);
    expect(usage.totalTokens).toBe(20);
  });
});

describe('usage and cost extraction', () => {
  it('prefers top-level cost when available', () => {
    const payload = {
      total_cost: 0.42,
      response: {
        meta: {
          usage: {
            prompt_tokens: 9,
            completion_tokens: 3,
          },
        },
      },
    };

    const { usage, cost } = extractUsageAndCost(payload);
    expect(usage.promptTokens).toBe(9);
    expect(usage.completionTokens).toBe(3);
    expect(usage.totalTokens).toBe(12);
    expect(cost).toBeCloseTo(0.42, 6);
  });

  it('falls back to nested usage definitions', () => {
    const payload = {
      data: {
        details: {
          token_usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            cost: 0.11,
          },
        },
      },
    };

    const { usage, cost } = extractUsageAndCost(payload);
    expect(usage.promptTokens).toBe(5);
    expect(usage.completionTokens).toBe(2);
    expect(usage.totalTokens).toBe(7);
    expect(cost).toBeCloseTo(0.11, 6);
  });
});

describe('markup application', () => {
  it('keeps explicit pricing when present', () => {
    const env = createEnv('3');
    const cost = resolveCostWithMarkup(env, 125, 40);
    expect(cost).toBe(125);
  });

  it('applies markup multiplier to fallback costs', () => {
    const env = createEnv('3');
    const cost = resolveCostWithMarkup(env, 0, 0.5);
    expect(cost).toBe(150);
  });

  it('handles invalid fallback values gracefully', () => {
    const env = createEnv('3');
    const cost = applyMarkupToCost(env, Number.NaN);
    expect(cost).toBe(0);
  });
});
