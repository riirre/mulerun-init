import { kv } from '@vercel/kv';

type MemoryEntry = {
  value: string;
  expiresAt?: number;
};

const memoryStore = new Map<string, MemoryEntry>();
let warned = false;

export function createKvNamespace(prefix: string): KVNamespace {
  if (canUseVercelKv()) {
    return new VercelKvNamespace(prefix);
  }
  if (!warned) {
    console.warn('[kv] Falling back to in-memory KV store. Data will not persist between restarts.');
    warned = true;
  }
  return new MemoryKvNamespace(prefix);
}

class VercelKvNamespace implements KVNamespace {
  constructor(private readonly prefix: string) {}

  private buildKey(key: string) {
    return `${this.prefix}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const stored = await kv.get<string>(this.buildKey(key));
    if (typeof stored === 'string') {
      return stored;
    }
    if (stored === null) {
      return null;
    }
    return JSON.stringify(stored);
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    const redisKey = this.buildKey(key);
    if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0) {
      await kv.set(redisKey, value, { ex: Math.floor(ttl) });
      return;
    }
    await kv.set(redisKey, value);
  }
}

class MemoryKvNamespace implements KVNamespace {
  constructor(private readonly prefix: string) {}

  private buildKey(key: string) {
    return `${this.prefix}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const entry = memoryStore.get(this.buildKey(key));
    if (!entry) {
      return null;
    }
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      memoryStore.delete(this.buildKey(key));
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    const expiresAt = typeof ttl === 'number' && ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    memoryStore.set(this.buildKey(key), { value, expiresAt });
  }
}

function canUseVercelKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

