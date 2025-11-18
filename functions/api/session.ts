import { Env, PagesFunctionWithEnv } from '../types';

import {
  computeRequestFingerprint,
  ensureAuthorizedSession,
  generateSessionToken,
  persistAuthorizedSession,
  normaliseOrigin,
  isSessionValidationDisabled,
} from '../session-store';



export const onRequestGet: PagesFunctionWithEnv = async (context) => {
  const url = new URL(context.request.url);
  const params = Object.fromEntries(url.searchParams);
  const fingerprint = computeRequestFingerprint(context.request);
  const bypassAuth = isSessionValidationDisabled(context.env);

  if (bypassAuth) {
    const session = {
      userId: params.userId?.trim() || 'dev-user',
      sessionId: params.sessionId?.trim() || 'dev-session',
      agentId: params.agentId?.trim() || context.env.AGENT_ID || 'dev-agent',
    };
    const token = params.sessionToken?.trim() || 'dev-token';

    return Response.json({
      success: true,
      bypassed: true,
      session,
      token,
    });
  }

  try {
    const required = ['userId', 'sessionId', 'agentId', 'time', 'nonce', 'signature', 'origin'];
    for (const key of required) {
      if (!params[key]) {
        return Response.json({ error: `Missing parameter: ${key}` }, { status: 400 });
      }
    }

    const reused = await tryReuseAuthorizedSession(context.env, params, fingerprint);
    if (reused) {
      return Response.json(reused);
    }

    const verification = await verifySignature(params, context.env.AGENT_KEY);
    if (!verification.valid) {
      if (params.debug === '1' || params.debug === 'true') {
        return Response.json(
          { error: 'Invalid signature', attempts: verification.attempts },
          { status: 401 }
        );
      }
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    const timestamp = Number.parseInt(params.time, 10);
    if (Number.isNaN(timestamp) || Math.abs(now - timestamp) > 90) {
      return Response.json({ error: 'Timestamp expired' }, { status: 401 });
    }

    const nonceStore = getNonceStore(context.env);
    const nonceKey = `nonce:${params.nonce}`;
    const exists = await nonceStore.get(nonceKey);
    if (exists) {
      return Response.json({ error: 'Nonce already used' }, { status: 401 });
    }
    await nonceStore.put(nonceKey, '1', { expirationTtl: 300 });

    const sessionToken = generateSessionToken();

    await persistAuthorizedSession(
      context.env,
      {
        sessionId: params.sessionId,
        userId: params.userId,
        agentId: params.agentId,
        origin: params.origin,
      },
      {
        token: sessionToken,
        fingerprint,
      }
    );

    return Response.json({
      success: true,
      session: {
        userId: params.userId,
        sessionId: params.sessionId,
        agentId: params.agentId,
      },
      token: sessionToken,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = message && message.toLowerCase().includes('origin') ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
};



async function tryReuseAuthorizedSession(env: Env, params: Record<string, string>, fingerprint: string) {
  const tokenParam = params.sessionToken?.trim();

  if (isSessionValidationDisabled(env)) {
    const session = {
      userId: params.userId?.trim() || 'dev-user',
      sessionId: params.sessionId?.trim() || 'dev-session',
      agentId: params.agentId?.trim() || 'dev-agent',
    };
    return {
      success: true,
      bypassed: true,
      reused: true,
      session,
      token: tokenParam || 'dev-token',
    };
  }

  try {
    const stored = await ensureAuthorizedSession(env, params.sessionId, {
      token: tokenParam,
      fingerprint,
      origin: params.origin,
      originCandidates: [params.origin, params.parentOrigin],
      requireToken: Boolean(tokenParam),
    });

    const requestedOrigin = normaliseOrigin(params.origin);

    if (
      stored &&
      stored.userId === params.userId &&
      stored.agentId === params.agentId &&
      (!stored.origin || !requestedOrigin || stored.origin === requestedOrigin)
    ) {
      return {
        success: true,
        reused: true,
        session: {
          userId: stored.userId,
          sessionId: stored.sessionId,
          agentId: stored.agentId,
        },
        token: stored.token,
      };
    }
  } catch (error) {
    const message = (error as Error).message || '';
    if (message.includes('not authorized') || message.includes('expired')) {
      return null;
    }
    throw error;
  }
  return null;
}

async function verifySignature(
  params: Record<string, string>,
  agentKey: string
): Promise<{ valid: boolean; attempts: Array<{ keys: string[]; payload: string; signature: string }> }> {

  const provided = params.signature;
  if (!provided) return { valid: false, attempts: [] };

  const ignoredKeys = new Set(['signature', 'parentOrigin', 'app', 'debug']);
  const allowedKeys = new Set([
    'userId',
    'sessionId',
    'agentId',
    'time',
    'origin',
    'nonce',
  ]);

  const allKeys = Object.keys(params)
    .filter((key) => key !== 'signature')
    .sort();
  const candidatePayloads = new Set<string>();
  const attempts: Array<{ keys: string[]; payload: string; signature: string }> = [];
  const keyVariants: string[][] = [
    allKeys,
    allKeys.filter((key) => !ignoredKeys.has(key)),
    allKeys.filter((key) => allowedKeys.has(key)),
  ].filter(
    (list, index, self) =>
      list.length > 0 &&
      self.findIndex((item) => item.join('|') === list.join('|')) === index
  );

  for (const keyList of keyVariants) {
    const canonicalObject = keyList.reduce((acc, key) => {
      if (params[key] !== undefined) {
        acc[key] = params[key];
      }
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(canonicalObject).length > 0) {
      candidatePayloads.add(JSON.stringify(canonicalObject));
    }
  }

  const providedLower = provided.toLowerCase();
  for (const payload of candidatePayloads) {
    const calculated = await computeHmacHex(agentKey, payload);
    const parsed = JSON.parse(payload) as Record<string, string>;
    const keys = Object.keys(parsed);
    attempts.push({ keys, payload, signature: calculated });
    if (calculated === providedLower) {
      return { valid: true, attempts };
    }
  }
  return { valid: false, attempts };

}

function getNonceStore(env: Env): KVNamespace {
  const binding =
    ((env as any).NONCE_KV_INIT as KVNamespace | undefined) ??
    ((env as any).KV_BINDING as KVNamespace | undefined) ??
    ((env as any).SESSION_KV as KVNamespace | undefined);

  if (binding) {
    return binding;
  }
  throw new Error('KV namespace binding not found. Expected NONCE_KV_INIT or KV_BINDING.');
}

async function computeHmacHex(agentKey: string, payload: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(agentKey);
  const msgData = encoder.encode(payload);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
}
