import pricingTable from './pricing.config.json';

import { Env } from './types';

type ChatPricingTier = {
  inputCents: number;
  outputCents: number;
};

type ImagePricingTier = {
  unitCents: number;
};

type ChatPricingConfigEntry = {
  key: string;
  aliases?: string[];
  inputCents: number;
  outputCents: number;
};

type ImagePricingConfigEntry = {
  key: string;
  unitCents: number;
  default?: boolean;
};

const DEFAULT_CHAT_MODEL = 'gpt-5-mini';
const DEFAULT_MARKUP = 1;
const MIN_MARKUP = 0.01;
const MAX_MARKUP = 1000;

type PricingConfig = {
  chatPricing: ChatPricingConfigEntry[];
  imagePricing: ImagePricingConfigEntry[];
};

const PRICING_CONFIG = pricingTable as PricingConfig;

const CHAT_PRICING_SOURCE: Array<{ aliases: string[]; pricing: ChatPricingTier }> = buildChatPricingSource(
  PRICING_CONFIG.chatPricing
);

const IMAGE_PRICING: { key: string; tier: ImagePricingTier } = buildImagePricingEntry(PRICING_CONFIG.imagePricing);

const chatPricingMap: Map<string, { key: string; pricing: ChatPricingTier }> = buildChatPricingMap();
const defaultChatEntry =
  chatPricingMap.get(normaliseModelKey(DEFAULT_CHAT_MODEL)) ??
  (() => {
    const fallback = CHAT_PRICING_SOURCE.find((entry) =>
      entry.aliases.some((alias) => normaliseModelKey(alias) === normaliseModelKey(DEFAULT_CHAT_MODEL))
    );
    if (!fallback) {
      throw new Error('Default chat pricing configuration is missing');
    }
    const key = normaliseModelKey(fallback.aliases[0]);
    return { key, pricing: fallback.pricing };
  })();

export function getMarkupMultiplier(env: Env): number {
  const raw = env.PRICING_MARKUP_MULTIPLIER;
  if (typeof raw !== 'string') {
    return DEFAULT_MARKUP;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return DEFAULT_MARKUP;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MARKUP;
  }

  const clamped = Math.min(Math.max(parsed, MIN_MARKUP), MAX_MARKUP);
  return clamped;
}

export interface ChatCostBreakdown {
  cost: number;
  baseCost: number;
  markup: number;
  inputCost: number;
  outputCost: number;
  tokens: {
    prompt: number;
    completion: number;
  };
  pricing: {
    modelKey: string;
    inputCents: number;
    outputCents: number;
  };
}

export function calculateChatCost(
  env: Env,
  model: string,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
): ChatCostBreakdown {
  let promptTokens = coerceTokens(usage.promptTokens);
  let completionTokens = coerceTokens(usage.completionTokens);

  if (promptTokens === 0 && completionTokens === 0) {
    const total = coerceTokens(usage.totalTokens);
    if (total > 0) {
      promptTokens = total;
    }
  }

  const { key, pricing } = resolveChatPricing(model);
  const markup = getMarkupMultiplier(env);

  const inputCostCents = Math.ceil((promptTokens * pricing.inputCents) / 1_000_000);
  const outputCostCents = Math.ceil((completionTokens * pricing.outputCents) / 1_000_000);

  const baseCost = inputCostCents + outputCostCents;
  const cost = Math.ceil(baseCost * markup);
  const inputCost = Math.ceil(inputCostCents * markup);
  const outputCost = Math.ceil(outputCostCents * markup);

  return {
    cost,
    baseCost,
    markup,
    inputCost,
    outputCost,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
    },
    pricing: {
      modelKey: key,
      inputCents: pricing.inputCents,
      outputCents: pricing.outputCents,
    },
  };
}

export interface ImageCostBreakdown {
  cost: number;
  baseCost: number;
  markup: number;
  unitCost: number;
  baseUnitCost: number;
  pricing: {
    modelKey: string;
    unitCents: number;
  };
  images: number;
}

export function calculateImageCost(env: Env, images: number): ImageCostBreakdown {
  const count = Number.isFinite(images) && images > 0 ? Math.floor(images) : 0;
  const markup = getMarkupMultiplier(env);
  const baseUnitCost = IMAGE_PRICING.tier.unitCents;
  const unitCost = Math.ceil(baseUnitCost * markup);
  const baseCost = baseUnitCost * count;
  const cost = Math.ceil(unitCost * count);

  return {
    cost,
    baseCost,
    markup,
    unitCost,
    baseUnitCost,
    pricing: {
      modelKey: IMAGE_PRICING.key,
      unitCents: IMAGE_PRICING.tier.unitCents,
    },
    images: count,
  };
}

function buildChatPricingSource(entries: ChatPricingConfigEntry[] = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Chat pricing configuration is missing');
  }

  return entries.map((entry) => {
    const aliases = dedupeStrings([entry.key, ...(entry.aliases ?? [])]);
    if (!aliases.length) {
      throw new Error('Chat pricing entry requires at least one alias');
    }

    return {
      aliases,
      pricing: {
        inputCents: Number(entry.inputCents),
        outputCents: Number(entry.outputCents),
      },
    };
  });
}

function buildImagePricingEntry(entries: ImagePricingConfigEntry[] = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Image pricing configuration is missing');
  }

  const target = entries.find((entry) => entry.default) ?? entries[0];
  const key = (target.key ?? '').trim();
  if (!key) {
    throw new Error('Image pricing entry requires key');
  }

  const unitCents = Number(target.unitCents);

  return {
    key,
    tier: {
      unitCents: Number.isFinite(unitCents) && unitCents > 0 ? unitCents : 0,
    },
  };
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function resolveChatPricing(model: string | null | undefined): { key: string; pricing: ChatPricingTier } {
  const initialKey = normaliseModelKey(model ?? '');

  if (initialKey) {
    const direct = findChatPricing(initialKey);
    if (direct) {
      return direct;
    }
  }

  return defaultChatEntry;
}

function findChatPricing(initialKey: string): { key: string; pricing: ChatPricingTier } | null {
  let candidate = initialKey;

  while (candidate) {
    const hit = chatPricingMap.get(candidate);
    if (hit) {
      return hit;
    }

    const shortened = candidate.replace(/-[^-]+$/, '');
    if (!shortened || shortened === candidate) {
      break;
    }
    candidate = shortened;
  }

  return null;
}

function buildChatPricingMap() {
  const map = new Map<string, { key: string; pricing: ChatPricingTier }>();

  for (const entry of CHAT_PRICING_SOURCE) {
    const canonical = normaliseModelKey(entry.aliases[0]);
    if (!canonical) {
      continue;
    }

    for (const alias of entry.aliases) {
      const normalised = normaliseModelKey(alias);
      if (!normalised) {
        continue;
      }
      map.set(normalised, { key: canonical, pricing: entry.pricing });
    }
  }

  return map;
}

function normaliseModelKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function coerceTokens(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed);
}
