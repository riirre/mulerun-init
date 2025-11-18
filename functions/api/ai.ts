import { PagesFunctionWithEnv } from '../types';
import { getMarkupMultiplier } from '../pricing';
import { computeRequestFingerprint, ensureAuthorizedSession, isSessionValidationDisabled } from '../session-store';
import { deriveImageCount } from '../services/metering';
import { createLogger, Logger, getNoopLogger } from '../logger';
import { runChatOperation } from './operations/chat';
import { runImageTask } from './operations/image-task';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 240_000;

type Operation = 'chat' | 'image_generate' | 'image_edit';

export {
  normaliseUsage,
  extractUsageAndCost,
  resolveCostWithMarkup,
  applyMarkupToCost,
  findUsageSource,
} from './operations/metrics';

interface AiRequest {
  sessionId?: string;
  sessionToken?: string;
  operation?: Operation;
  payload?: Record<string, unknown>;
  prompt?: string;
  messages?: unknown[];
  options?: {
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
  };
}

export const onRequestPost: PagesFunctionWithEnv = async (context) => {
  const logger = createLogger(context.env, 'api/ai');
  try {
    const apiToken = context.env.MULERUN_API_KEY;
    if (!apiToken) {
      return Response.json({ error: 'MULERUN_API_KEY not configured' }, { status: 500 });
    }

    const body = (await context.request.json()) as AiRequest;
    const bypassAuth = isSessionValidationDisabled(context.env);

    const rawSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const sessionId = rawSessionId || (bypassAuth ? 'dev-session' : '');
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const rawToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
    const sessionToken = rawToken || (bypassAuth ? 'dev-token' : '');
    if (!sessionToken && !bypassAuth) {
      return Response.json({ error: 'Missing session token' }, { status: 401 });
    }

    const fingerprint = computeRequestFingerprint(context.request);
    const originCandidates = collectRequestOriginCandidates(context.request);
    if (!bypassAuth || sessionToken) {
      await ensureAuthorizedSession(context.env, sessionId, {
        token: sessionToken,
        fingerprint,
        origin: originCandidates[0] ?? null,
        originCandidates,
      });
    }

    const operation = body.operation ?? 'chat';
    const basePayload = body.payload ?? {};
    const payload: Record<string, unknown> = { ...basePayload };
    if (!('prompt' in payload) && typeof body.prompt === 'string') {
      payload.prompt = body.prompt;
    }
    if (!('messages' in payload) && Array.isArray(body.messages)) {
      payload.messages = body.messages;
    }
    const pollIntervalMs = body.options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs = body.options?.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

    if (operation === 'chat') {
      const chatResult = await runChatOperation(context.env, payload);
      const metering = await maybeReportMetering(
        context.request.url,
        sessionId,
        sessionToken,
        {
          cost: chatResult.cost ?? 0,
          type: 'chat',
          model: chatResult.model,
          usage: chatResult.usage,
          markupMultiplier: chatResult.pricing?.markup ?? getMarkupMultiplier(context.env),
        },
        {
          fingerprint,
          logger,
          internalToken: context.env.INTERNAL_METERING_TOKEN,
        }
      );

      return Response.json({
        success: true,
        operation,
        data: chatResult.data,
        usage: chatResult.usage,
        cost: chatResult.cost,
        pricing: chatResult.pricing,
        metering,
      });
    }

    if (operation === 'image_generate') {
      const imageResult = await runImageTask({
        env: context.env,
        kind: 'generation',
        payload,
        pollIntervalMs,
        pollTimeoutMs,
      });

      const metering = await maybeReportMetering(
        context.request.url,
        sessionId,
        sessionToken,
        {
          cost: imageResult.cost ?? 0,
          type: 'image',
          model: imageResult.pricing?.pricing?.modelKey,
          usage: imageResult.usage,
          images: imageResult.pricing?.images ?? imageResult.images.length,
          markupMultiplier: imageResult.pricing?.markup ?? getMarkupMultiplier(context.env),
        },
        {
          fingerprint,
          logger,
          internalToken: context.env.INTERNAL_METERING_TOKEN,
        }
      );

      return Response.json({
        success: true,
        operation,
        data: imageResult.data,
        images: imageResult.images,
        usage: imageResult.usage,
        cost: imageResult.cost,
        pricing: imageResult.pricing,
        metering,
      });
    }

    if (operation === 'image_edit') {
      const imageResult = await runImageTask({
        env: context.env,
        kind: 'edit',
        payload,
        pollIntervalMs,
        pollTimeoutMs,
      });

      const metering = await maybeReportMetering(
        context.request.url,
        sessionId,
        sessionToken,
        {
          cost: imageResult.cost ?? 0,
          type: 'image',
          model: imageResult.pricing?.pricing?.modelKey,
          usage: imageResult.usage,
          images: imageResult.pricing?.images ?? imageResult.images.length,
          markupMultiplier: imageResult.pricing?.markup ?? getMarkupMultiplier(context.env),
        },
        {
          fingerprint,
          logger,
          internalToken: context.env.INTERNAL_METERING_TOKEN,
        }
      );

      return Response.json({
        success: true,
        operation,
        data: imageResult.data,
        images: imageResult.images,
        usage: imageResult.usage,
        cost: imageResult.cost,
        pricing: imageResult.pricing,
        metering,
      });
    }

    return Response.json({ error: `Unsupported operation: ${operation}` }, { status: 400 });
  } catch (error) {
    logger.error('Failed to call MuleRun API', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
};

type MeteringDetail = {
  cost?: number;
  type?: 'chat' | 'image' | 'combined';
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  images?: number | unknown[] | { length?: number };
  markupMultiplier?: number;
};

type MeteringOptions = {
  fingerprint?: string;
  logger?: Logger;
  internalToken?: string;
};

async function maybeReportMetering(
  requestUrl: string,
  sessionId: string,
  sessionToken: string,
  detail: MeteringDetail,
  options: MeteringOptions = {}
) {
  const { fingerprint, logger, internalToken } = options;
  const log = logger ?? getNoopLogger();
  const usage = detail.usage;
  const hasUsage = usage ? hasPositiveUsage(usage) : false;
  const imageCount = deriveImageCount(detail.images);
  const hasImages = imageCount > 0;

  if (!hasUsage && !hasImages) {
    const explicitCost = Number(detail.cost);
    if (!Number.isFinite(explicitCost) || explicitCost <= 0) {
      return { success: false, skipped: true };
    }
  }

  if (!isUuid(sessionId)) {
    log.warn('Skipping metering report: sessionId is not a UUID', { sessionId });
    return { success: false, skipped: true };
  }

  if (!sessionToken) {
    log.warn('Skipping metering report: missing session token', { sessionId });
    return { success: false, skipped: true };
  }

  const resolvedType =
    detail.type ??
    (hasUsage && hasImages ? 'combined' : hasImages ? 'image' : hasUsage ? 'chat' : undefined);

  try {
    const origin = new URL(requestUrl).origin;

    const payload: Record<string, unknown> = {
      sessionId,
      sessionToken,
      isFinal: false,
      model: detail.model,
      markupMultiplier: detail.markupMultiplier,
    };
    if (fingerprint) {
      payload.fingerprint = fingerprint;
    }

    if (resolvedType) {
      payload.type = resolvedType;
    }

    if (hasUsage) {
      payload.usage = usage;
    }

    if (hasImages) {
      payload.images = imageCount;
    }

    if (!hasUsage && !hasImages) {
      const explicitCost = Number(detail.cost);
      payload.cost = Math.ceil(explicitCost);
    }

    log.debug('Prepared metering payload', {
      sessionId,
      hasUsage,
      hasImages,
      type: payload.type,
      cost: payload.cost,
      model: payload.model,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (internalToken) {
      headers['X-Internal-Metering'] = internalToken;
    }

    const response = await fetch(`${origin}/api/metering`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn('Metering report failed', { sessionId, error: errorText });
      return { success: false, error: errorText };
    }

    const result = await response.json();
    log.info('Metering report success', {
      sessionId,
      meteringId: result?.meteringId,
      finalCost: result?.finalCost,
    });
    return { success: true, ...result };
  } catch (error) {
    log.warn('Metering report error', { sessionId, error });
    return { success: false, error: (error as Error).message };
  }
}

function hasPositiveUsage(usage: NonNullable<MeteringDetail['usage']>) {
  const values = [usage.promptTokens, usage.completionTokens, usage.totalTokens];
  return values.some((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function collectRequestOriginCandidates(request: Request) {
  const candidates = new Set<string>();

  const originHeader = request.headers.get('Origin');
  if (originHeader) {
    candidates.add(originHeader);
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      candidates.add(refererUrl.origin);

      const originParam = refererUrl.searchParams.get('origin');
      if (originParam) {
        candidates.add(originParam);
      }

      const parentOrigin = refererUrl.searchParams.get('parentOrigin');
      if (parentOrigin) {
        candidates.add(parentOrigin);
      }
    } catch {
      // ignore malformed referer values
    }
  }

  return Array.from(candidates);
}
