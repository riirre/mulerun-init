import { Env } from '../../types';
import { getMarkupMultiplier } from '../../pricing';

export function normaliseUsage(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const promptTokens =
    raw.prompt_tokens ??
    raw.promptTokens ??
    raw.prompt_token_count ??
    raw.promptTokenCount ??
    raw.input_tokens ??
    raw.inputTokens ??
    raw.input_token_count ??
    raw.inputTokenCount ??
    0;

  const completionTokens =
    raw.completion_tokens ??
    raw.completionTokens ??
    raw.completion_token_count ??
    raw.completionTokenCount ??
    raw.candidates_token_count ??
    raw.candidatesTokenCount ??
    raw.output_tokens ??
    raw.outputTokens ??
    raw.output_token_count ??
    raw.outputTokenCount ??
    0;

  const totalTokens =
    raw.total_tokens ??
    raw.totalTokens ??
    raw.total_token_count ??
    raw.totalTokenCount ??
    promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function extractUsageAndCost(payload: Record<string, unknown>) {
  const usageSource =
    findUsageSource(payload, ['usage', 'usageMetadata', 'usage_meta', 'token_usage', 'usageInfo']) ??
    findUsageSource(payload, ['task_info']) ??
    {};

  const usage = normaliseUsage(usageSource as Record<string, unknown>);

  if (!usage.totalTokens) {
    const totalTokensCandidate = Number(
      (usageSource as any)?.total_tokens ??
        (usageSource as any)?.totalTokens ??
        (usageSource as any)?.tokens ??
        0
    );
    if (Number.isFinite(totalTokensCandidate) && totalTokensCandidate > 0) {
      usage.totalTokens = totalTokensCandidate;
    }
  }

  let costCandidates: Array<unknown> = [];
  costCandidates = costCandidates.concat(
    (payload as any)?.cost,
    (payload as any)?.total_cost,
    (payload as any)?.totalCost,
    (payload as any)?.billing?.total_cost,
    (payload as any)?.billing?.totalCost,
    (payload as any)?.task_info?.cost,
    (usageSource as any)?.cost
  );

  let cost = costCandidates.find(
    (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  ) as number | undefined;

  if (typeof cost !== 'number' || !Number.isFinite(cost)) {
    cost = 0;
  }

  return { usage, cost };
}

export function findUsageSource(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | null {
  const stack: Array<Record<string, unknown>> = [source];
  const visited = new Set<Record<string, unknown>>();

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const key of keys) {
      const value = current[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return null;
}

export function resolveCostWithMarkup(env: Env, preferredCost: number, fallbackCost: number) {
  if (Number.isFinite(preferredCost) && preferredCost > 0) {
    return Math.ceil(preferredCost);
  }
  const fallbackValue = Number(fallbackCost);
  const fallbackCents = Number.isFinite(fallbackValue) ? Math.ceil(fallbackValue * 100) : 0;
  return applyMarkupToCost(env, fallbackCents);
}

export function applyMarkupToCost(env: Env, baseCost: number) {
  const value = Number(baseCost);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const markup = getMarkupMultiplier(env);
  return Math.ceil(value * markup);
}
