import { Env } from '../functions/types';
import { createKvNamespace } from './kv';

const DEFAULT_METERING_ENDPOINT = 'https://api.mulerun.com/sessions/metering';

let cachedEnv: Env | null = null;

export function getRequestEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const sessionStore = createKvNamespace('session');
  const nonceStore = createKvNamespace('nonce');

  cachedEnv = {
    AGENT_KEY: process.env.AGENT_KEY ?? '',
    AGENT_ID: process.env.AGENT_ID ?? '',
    MULERUN_API_KEY: process.env.MULERUN_API_KEY ?? '',
    MULERUN_API_BASE: process.env.MULERUN_API_BASE,
    METERING_ENDPOINT: process.env.METERING_ENDPOINT ?? DEFAULT_METERING_ENDPOINT,
    METERING_GET_ENDPOINT: process.env.METERING_GET_ENDPOINT,
    PRICING_MARKUP_MULTIPLIER: process.env.PRICING_MARKUP_MULTIPLIER,
    NONCE_KV_INIT: nonceStore,
    SESSION_KV: sessionStore,
    DEV_SESSION_ALLOWLIST: process.env.DEV_SESSION_ALLOWLIST,
    SESSION_ALLOWED_ORIGINS: process.env.SESSION_ALLOWED_ORIGINS,
    SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS,
    SESSION_VALIDATION_DISABLED: process.env.SESSION_VALIDATION_DISABLED,
    SESSION_REQUIRE_FINGERPRINT: process.env.SESSION_REQUIRE_FINGERPRINT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    INTERNAL_METERING_TOKEN: process.env.INTERNAL_METERING_TOKEN,
    ASSET_HOST_ALLOWLIST: process.env.ASSET_HOST_ALLOWLIST,
    CLOUDFLARE_ASSET_BASE_URL: process.env.CLOUDFLARE_ASSET_BASE_URL,
  };

  return cachedEnv;
}

