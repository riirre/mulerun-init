import { Env, PagesFunctionWithEnv } from '../types';
import { computeRequestFingerprint, ensureAuthorizedSession, isSessionValidationDisabled } from '../session-store';
import { resolveMeteringCost } from '../services/metering';
import type { MeteringCalculationInput } from '../services/metering';
import { creditsToUsageUnits } from '../utils/metering';
import { createLogger } from '../logger';

const DEFAULT_GET_ENDPOINT = 'https://api.mulerun.com/sessions/metering';

interface MeteringRequestBody extends MeteringCalculationInput {
  sessionId?: string;
  sessionToken?: string;
  isFinal?: boolean;
  meteringId?: string;
  fingerprint?: string;
}

export async function handleMeteringPost(request: Request, env: Env) {
  const logger = createLogger(env, 'api/metering');
  try {
    const body = (await request.json()) as MeteringRequestBody;
    const bypassAuth = isSessionValidationDisabled(env);
    const { sessionToken: rawToken, isFinal = false } = body;
    logger.debug('POST received', {
      sessionId: body.sessionId,
      hasUsage: Boolean(body.usage),
      images: Array.isArray(body.images) ? body.images.length : body.images,
      cost: body.cost,
      isFinal,
      hasFingerprint: Boolean(body.fingerprint),
    });

    const rawSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const sessionId = rawSessionId || (bypassAuth ? 'dev-session' : '');
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const trimmedToken = typeof rawToken === 'string' ? rawToken.trim() : '';
    const sessionToken = trimmedToken || (bypassAuth ? 'dev-token' : '');
    if (!sessionToken && !bypassAuth) {
      return Response.json({ error: 'Missing session token' }, { status: 401 });
    }

    if (body.fingerprint && env.INTERNAL_METERING_TOKEN) {
      const headerToken = request.headers.get('X-Internal-Metering');
      if (headerToken !== env.INTERNAL_METERING_TOKEN) {
        return Response.json({ error: 'Unauthorized internal metering request' }, { status: 403 });
      }
    }

    if (!bypassAuth || sessionToken) {
      const providedFingerprint =
        typeof body.fingerprint === 'string' && body.fingerprint.trim() ? body.fingerprint.trim() : null;
      const fingerprint = providedFingerprint ?? computeRequestFingerprint(request);
      await ensureAuthorizedSession(env, sessionId, {
        token: sessionToken,
        fingerprint,
        origin: request.headers.get('Origin'),
      });
    }

    const resolved = resolveMeteringCost(env, body);
    if (!Number.isFinite(resolved.cost) || resolved.cost <= 0) {
      return Response.json({ error: 'Invalid cost or insufficient pricing data' }, { status: 400 });
    }

    const meteringId =
      typeof body.meteringId === 'string' && body.meteringId.trim()
        ? body.meteringId.trim()
        : crypto.randomUUID();

    const upstreamCost = creditsToUsageUnits(resolved.cost);

    const payload = {
      agentId: env.AGENT_ID,
      sessionId,
      cost: upstreamCost,
      timestamp: new Date().toISOString(),
      isFinal,
      meteringId,
    };
    logger.debug('Forwarding to MuleRun', {
      sessionId,
      meteringId,
      costUnits: upstreamCost,
      isFinal,
    });

    const response = await fetch(env.METERING_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AGENT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('MuleRun error', { sessionId, meteringId, status: response.status, errorText });
      throw new Error(errorText || `Metering API failed with ${response.status}`);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // ignore
    }
    logger.info('MuleRun success', { sessionId, meteringId, response: data });

    const pricing =
      resolved.breakdown.length <= 1
        ? resolved.breakdown[0] ?? null
        : resolved.breakdown;

    return Response.json({
      success: true,
      meteringId: (data as any)?.meteringId ?? meteringId,
      response: data,
      finalCost: resolved.cost,
      pricing,
      breakdown: resolved.breakdown,
      markup: resolved.markup,
    });
  } catch (error) {
    logger.error('POST error', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function handleMeteringGet(request: Request, env: Env) {
  const logger = createLogger(env, 'api/metering');
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const sessionToken = url.searchParams.get('sessionToken')?.trim();
    logger.debug('GET request', { sessionId });
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }
    if (!sessionToken) {
      return Response.json({ error: 'Missing session token' }, { status: 401 });
    }

    const fingerprint = computeRequestFingerprint(request);
    await ensureAuthorizedSession(env, sessionId, {
      token: sessionToken,
      fingerprint,
      origin: request.headers.get('Origin'),
    });

    const base = (env.METERING_GET_ENDPOINT || DEFAULT_GET_ENDPOINT).replace(/\/$/, '');
    const targetUrl = `${base}/${sessionId}`;

    const response = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${env.AGENT_KEY}`,
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || response.statusText);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    logger.debug('GET success', { sessionId, length: Array.isArray((data as any)?.data) ? (data as any).data.length : undefined });

    return Response.json({ success: true, data });
  } catch (error) {
    logger.error('GET error', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export const onRequestPost: PagesFunctionWithEnv = async (context) =>
  handleMeteringPost(context.request, context.env);

export const onRequestGet: PagesFunctionWithEnv = async (context) => handleMeteringGet(context.request, context.env);
