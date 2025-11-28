import { Env } from './types';

const SESSION_PREFIX = 'session:';
const DEFAULT_SESSION_TTL = 60 * 60; // 1 hour
const MAX_SESSION_TTL = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_ALLOWED_ORIGINS = 'mulerun.com';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);

export type StoredSession = {
  sessionId: string;
  userId: string;
  agentId: string;
  origin?: string;
  token: string;
  fingerprint?: string | null;
  storedAt: string;
};

type PersistOptions = {
  token: string;
  fingerprint?: string | null;
  ttlSeconds?: number;
};

type EnsureOptions = {
  token?: string;
  origin?: string | null;
  originCandidates?: Array<string | null | undefined>;
  fingerprint?: string | null;
  requireToken?: boolean;
  bypassDevelopmentChecks?: boolean;
};

export async function persistAuthorizedSession(
  env: Env,
  session: { sessionId: string; userId: string; agentId: string; origin?: string | null },
  options: PersistOptions
) {
  const store = getSessionStore(env);
  const payload: StoredSession = {
    sessionId: session.sessionId,
    userId: session.userId,
    agentId: session.agentId,
    origin: normaliseOrigin(session.origin) ?? undefined,
    token: options.token,
    fingerprint: options.fingerprint ?? null,
    storedAt: new Date().toISOString(),
  };

  const expirationTtl = resolveTtl(env, options.ttlSeconds);

  await store.put(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(payload), {
    expirationTtl,
  });
}

export function isSessionValidationDisabled(env: Env): boolean {
  const raw = env.SESSION_VALIDATION_DISABLED ?? '';
  if (typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())) {
    return true;
  }
  return false;
}

function isFingerprintRequired(env: Env): boolean {
  const raw = env.SESSION_REQUIRE_FINGERPRINT ?? '';
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase());
}

export async function ensureAuthorizedSession(env: Env, sessionId: string, options: EnsureOptions = {}) {
  if (isSessionValidationDisabled(env)) {
    return {
      sessionId: sessionId || 'dev-session',
      userId: 'dev-user',
      agentId: 'dev-agent',
      token: options.token ?? 'dev-token',
      storedAt: new Date().toISOString(),
      bypassed: true,
    } as StoredSession & { bypassed: true };
  }

  if (!options.bypassDevelopmentChecks && isDevBypassedSession(env, sessionId)) {
    return { sessionId, bypassed: true } as StoredSession & { bypassed: true };
  }

  const store = getSessionStore(env);
  const raw = await store.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) {
    throw new Error('Session not authorized or expired. Please launch via MuleRun.');
  }

  let stored: StoredSession;
  try {
    stored = JSON.parse(raw) as StoredSession;
  } catch (error) {
    console.warn('Failed to parse stored session payload:', error);
    throw new Error('Stored session is corrupted. Please relaunch via MuleRun.');
  }

  const storedOrigin = normaliseOrigin(stored.origin);
  stored.origin = storedOrigin ?? undefined;

  const candidateValues = [
    options.origin,
    ...(Array.isArray(options.originCandidates) ? options.originCandidates : []),
  ];

  const requestedOrigins = candidateValues
    .map((value) => normaliseOrigin(value))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (!isOriginAllowed(env, storedOrigin ?? undefined)) {
    throw new Error('Session origin is not allowed for this deployment. Please use MuleRun platform.');
  }
  if (storedOrigin && requestedOrigins.length > 0 && !requestedOrigins.includes(storedOrigin)) {
    throw new Error('Origin mismatch for this session. Please relaunch via MuleRun.');
  }

  const tokenRequired = stored.token && (options.requireToken ?? true);
  if (tokenRequired) {
    if (!options.token) {
      throw new Error('Session token is required.');
    }
    if (stored.token !== options.token) {
      throw new Error('Session token mismatch.');
    }
  }

  if (
    isFingerprintRequired(env) &&
    stored.fingerprint &&
    options.fingerprint &&
    stored.fingerprint !== options.fingerprint
  ) {
    throw new Error('Session fingerprint mismatch.');
  }

  return stored;
}

export function computeRequestFingerprint(request: Request) {
  const userAgent = request.headers.get('User-Agent') ?? '';
  const cfIp = request.headers.get('CF-Connecting-IP') ?? '';
  const forwardedIp = request.headers.get('X-Forwarded-For') ?? '';
  const acceptLanguage = request.headers.get('Accept-Language') ?? '';
  const acceptEncoding = request.headers.get('Accept-Encoding') ?? '';
  const hint = request.headers.get('Sec-CH-UA') ?? '';

  return `${userAgent}|${cfIp}|${forwardedIp}|${acceptLanguage}|${acceptEncoding}|${hint}`;
}

export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function getSessionStore(env: Env): KVNamespace {
  const binding =
    ((env as any).SESSION_KV as KVNamespace | undefined) ??
    ((env as any).NONCE_KV_INIT as KVNamespace | undefined) ??
    ((env as any).KV_BINDING as KVNamespace | undefined);

  if (binding) {
    return binding;
  }

  throw new Error('KV namespace not configured. Expected SESSION_KV or NONCE_KV_INIT.');
}

function normaliseTtl(candidate?: number) {
  if (!Number.isFinite(candidate) || candidate! <= 0) {
    return DEFAULT_SESSION_TTL;
  }
  const value = Math.floor(candidate!);
  return Math.max(60, Math.min(value, MAX_SESSION_TTL));
}

function resolveTtl(env: Env, override?: number) {
  if (Number.isFinite(override) && override! > 0) {
    return normaliseTtl(override);
  }

  const envOverride = Number(env.SESSION_TTL_SECONDS);
  if (Number.isFinite(envOverride) && envOverride > 0) {
    return normaliseTtl(envOverride);
  }

  return DEFAULT_SESSION_TTL;
}

function isDevBypassedSession(env: Env, sessionId: string) {
  const raw = env.DEV_SESSION_ALLOWLIST;
  if (typeof raw !== 'string' || !raw.trim()) {
    return false;
  }

  const entries = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (entries.some((value) => value === '*' || value === 'all')) {
    return true;
  }

  return entries.some((allowed) => allowed === sessionId);
}

function isOriginAllowed(env: Env, origin?: string) {
  const allowlist = getAllowedOrigins(env);
  if (!allowlist.length) {
    return true;
  }
  const normalised = normaliseOrigin(origin);
  if (!normalised) {
    return false;
  }

  const originHost = extractHost(normalised);

  return allowlist.some((allowed) => {
    const allowedHost = extractHost(allowed);
    if (allowedHost && originHost) {
      return hostsMatch(originHost, allowedHost);
    }
    if (allowedHost) {
      return hostsMatch(normalised, allowedHost);
    }
    return normalised === allowed;
  });
}

function getAllowedOrigins(env: Env) {
  const raw = typeof env.SESSION_ALLOWED_ORIGINS === 'string' ? env.SESSION_ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;
  const entries = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!entries.length) {
    return [];
  }

  if (entries.includes('*') || entries.includes('all')) {
    return [];
  }

  return entries;
}

function canonicaliseOrigin(value: string) {
  const candidates = [value, `https://${value}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const protocol = url.protocol ? url.protocol.toLowerCase() : 'https:';
      const hostname = url.hostname.toLowerCase();
      if (!hostname) {
        continue;
      }

      const port = url.port;
      const isDefaultPort =
        !port || (protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443');
      let origin = `${protocol}//${hostname}`;
      if (!isDefaultPort && port) {
        origin += `:${port}`;
      }
      return origin;
    } catch {
      // continue to next candidate
    }
  }
  return null;
}

export function normaliseOrigin(origin?: string | null) {
  if (typeof origin !== 'string') {
    return null;
  }
  const trimmed = origin.trim();
  if (!trimmed) {
    return null;
  }
  return canonicaliseOrigin(trimmed) ?? trimmed.toLowerCase();
}

function extractHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    const withoutScheme = value.replace(/^[a-z]+:\/\//, '');
    const host = withoutScheme.split('/')[0];
    return host.split(':')[0].toLowerCase();
  }
}

function hostsMatch(host: string, allowed: string) {
  return host === allowed || host.endsWith(`.${allowed}`);
}
