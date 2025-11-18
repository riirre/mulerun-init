// Cloudflare Workers types
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  }

  interface R2PutOptions {
    httpMetadata?: {
      contentType?: string;
      cacheControl?: string;
    };
  }

  interface R2Bucket {
    put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream, options?: R2PutOptions): Promise<void>;
  }
}

export interface Env {
  AGENT_KEY: string;
  AGENT_ID: string;
  MULERUN_API_KEY: string;
  MULERUN_API_BASE?: string;
  METERING_ENDPOINT: string;
  METERING_GET_ENDPOINT?: string;
  PRICING_MARKUP_MULTIPLIER?: string;
  NONCE_KV_INIT?: KVNamespace;
  SESSION_KV?: KVNamespace;
  DEV_SESSION_ALLOWLIST?: string;
  SESSION_ALLOWED_ORIGINS?: string;
  SESSION_TTL_SECONDS?: string;
  SESSION_VALIDATION_DISABLED?: string;
  SESSION_REQUIRE_FINGERPRINT?: string;
  LOG_LEVEL?: string;
  INTERNAL_METERING_TOKEN?: string;
  ASSET_HOST_ALLOWLIST?: string;
  CLOUDFLARE_ASSET_BASE_URL?: string;
}

export interface PagesFunction {
  (context: {
    request: Request;
    env: Env;
    next: () => Promise<Response>;
  }): Promise<Response>;
}

export interface PagesFunctionWithEnv {
  (context: {
    request: Request;
    env: Env;
    next: () => Promise<Response>;
  }): Promise<Response>;
}
