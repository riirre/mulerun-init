// 使用内存存储，适合实验性项目
// 注意：数据不会持久化，服务重启后数据会丢失

type MemoryEntry = {
  value: string;
  expiresAt?: number;
};

const memoryStore = new Map<string, MemoryEntry>();

export function createKvNamespace(prefix: string): KVNamespace {
  return new MemoryKvNamespace(prefix);
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

