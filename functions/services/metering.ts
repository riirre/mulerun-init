import { calculateChatCost, calculateImageCost, getMarkupMultiplier } from '../pricing';
import type { ChatCostBreakdown, ImageCostBreakdown } from '../pricing';
import { Env } from '../types';

export type MeteringType = 'chat' | 'image' | 'combined';

export interface MeteringUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface MeteringCalculationInput {
  type?: MeteringType;
  model?: string;
  usage?: MeteringUsage;
  images?: number | unknown[] | { length?: number };
  cost?: number;
  markupMultiplier?: number | string;
}

export interface MeteringBreakdownEntry {
  type: Extract<MeteringType, 'chat' | 'image'>;
  detail: ChatCostBreakdown | ImageCostBreakdown;
}

export interface MeteringCalculationResult {
  cost: number;
  breakdown: MeteringBreakdownEntry[];
  markup: number;
}

export function resolveMeteringCost(env: Env, input: MeteringCalculationInput): MeteringCalculationResult {
  const overrideEnv = applyMarkupOverride(env, input.markupMultiplier);
  const markup = getMarkupMultiplier(overrideEnv);

  const breakdown: MeteringBreakdownEntry[] = [];

  if (allowsChatCalculation(input.type) && hasUsageTokens(input.usage)) {
    const detail = calculateChatCost(overrideEnv, input.model ?? '', input.usage ?? {});
    if (Number.isFinite(detail.cost) && detail.cost > 0) {
      breakdown.push({ type: 'chat', detail });
    }
  }

  if (allowsImageCalculation(input.type)) {
    const imageCount = deriveImageCount(input.images);
    if (imageCount > 0) {
      const detail = calculateImageCost(overrideEnv, imageCount);
      if (Number.isFinite(detail.cost) && detail.cost > 0) {
        breakdown.push({ type: 'image', detail });
      }
    }
  }

  const totalCost = breakdown.reduce((sum, entry) => sum + entry.detail.cost, 0);
  const explicitCost = Number(input.cost);
  const fallbackCost =
    Number.isFinite(explicitCost) && explicitCost > 0 ? Math.ceil(explicitCost) : NaN;
  const resolvedCost = totalCost > 0 ? totalCost : fallbackCost;

  return {
    cost: resolvedCost > 0 ? resolvedCost : NaN,
    breakdown,
    markup,
  };
}

function allowsChatCalculation(type: MeteringType | undefined) {
  if (!type || type === 'combined') {
    return true;
  }
  return type === 'chat';
}

function allowsImageCalculation(type: MeteringType | undefined) {
  if (!type || type === 'combined') {
    return true;
  }
  return type === 'image';
}

function hasUsageTokens(usage: MeteringUsage | undefined) {
  if (!usage) {
    return false;
  }

  const values = [usage.promptTokens, usage.completionTokens, usage.totalTokens];
  return values.some((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  });
}

function applyMarkupOverride(env: Env, override: number | string | undefined): Env {
  if (override === null || override === undefined) {
    return env;
  }

  const parsed = Number(override);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return env;
  }

  return {
    ...env,
    PRICING_MARKUP_MULTIPLIER: parsed.toString(),
  };
}

export function deriveImageCount(source: MeteringCalculationInput['images']) {
  if (typeof source === 'number') {
    return Number.isFinite(source) && source > 0 ? Math.round(source) : 0;
  }
  if (Array.isArray(source)) {
    return source.length;
  }
  if (source && typeof source === 'object' && 'length' in source) {
    const length = Number((source as { length?: number }).length);
    if (Number.isFinite(length) && length > 0) {
      return Math.round(length);
    }
  }
  return 0;
}
