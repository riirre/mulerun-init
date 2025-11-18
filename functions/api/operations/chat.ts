import { Env } from '../../types';
import { calculateChatCost } from '../../pricing';
import { callMuleRun } from './client';
import { extractUsageAndCost, resolveCostWithMarkup } from './metrics';

export interface ChatOperationResult {
  data: Record<string, unknown>;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  cost: number;
  pricing: import('../../pricing').ChatCostBreakdown;
  model: string;
}

export async function runChatOperation(env: Env, payload: Record<string, unknown>): Promise<ChatOperationResult> {
  const { vendor: rawVendor, ...rest } = payload;
  const vendor = typeof rawVendor === 'string' ? rawVendor.toLowerCase() : 'openai';
  const vendorKey =
    vendor === 'google' ? 'google' : vendor === 'anthropic' ? 'anthropic' : 'openai';

  const defaultModels: Record<string, string> = {
    openai: 'gpt-5-mini',
    google: 'gemini-2.5-flash',
    anthropic: 'claude-sonnet-4-0',
  };

  const model = typeof rest.model === 'string' ? rest.model : defaultModels[vendorKey];
  const messages = Array.isArray(rest.messages) ? rest.messages : undefined;
  const prompt = typeof rest.prompt === 'string' ? rest.prompt : undefined;

  if (!messages && !prompt) {
    throw new Error('Chat invocation requires messages or prompt text.');
  }

  if (vendorKey === 'anthropic') {
    const anthropicMessages = normaliseAnthropicMessages(
      messages ?? [{ role: 'user', content: prompt ?? '' }]
    );

    const requestBody: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_output_tokens:
        typeof rest.max_output_tokens === 'number'
          ? rest.max_output_tokens
          : typeof rest.maxOutputTokens === 'number'
          ? rest.maxOutputTokens
          : 1024,
    };

    const responseJson = await callMuleRun(env, '/vendors/anthropic/v1/messages', 'POST', requestBody);

    const usageInfo = extractUsageAndCost(responseJson as Record<string, unknown>);
    const pricing = calculateChatCost(env, model, usageInfo.usage);
    const cost = resolveCostWithMarkup(env, pricing.cost, usageInfo.cost);

    return {
      data: responseJson as Record<string, unknown>,
      usage: usageInfo.usage,
      cost,
      pricing,
      model,
    };
  }

  const requestBody = messages
    ? { ...rest, model, messages }
    : {
        ...rest,
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

  const GOOGLE_DIRECT_CHAT_MODELS = new Set([
    'gemini-2.5-flash-image-preview',
    'gemini-2.5-flash',
  ]);

  let endpoint = '/vendors/openai/v1/chat/completions';
  if (vendorKey === 'google') {
    endpoint = GOOGLE_DIRECT_CHAT_MODELS.has(model)
      ? '/v1/chat/completions'
      : '/vendors/google/v1/chat/completions';
  }

  const responseJson = await callMuleRun(env, endpoint, 'POST', requestBody);

  const usageInfo = extractUsageAndCost(responseJson as Record<string, unknown>);
  const pricing = calculateChatCost(env, model, usageInfo.usage);
  const cost = resolveCostWithMarkup(env, pricing.cost, usageInfo.cost);

  return {
    data: responseJson as Record<string, unknown>,
    usage: usageInfo.usage,
    cost,
    pricing,
    model,
  };
}

type AnthropicMessage = {
  role: string;
  content: Array<{ type: string; text?: string }>;
};

function normaliseAnthropicMessages(messages: Array<Record<string, unknown>>): AnthropicMessage[] {
  return messages.map((message) => {
    const role = typeof message.role === 'string' && message.role === 'assistant' ? 'assistant' : 'user';
    const content = toAnthropicContentParts(message.content ?? '');
    return { role, content };
  });
}

function toAnthropicContentParts(content: unknown) {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') {
        return { type: 'text', text: part };
      }
      if (part && typeof part === 'object' && 'type' in part) {
        return part as { type: string; text?: string };
      }
      return { type: 'text', text: JSON.stringify(part) };
    });
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return [{ type: 'text', text: JSON.stringify(content) }];
}
