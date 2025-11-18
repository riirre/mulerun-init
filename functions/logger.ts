import { Env } from './types';

const LEVEL_WEIGHT = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

export type LogLevel = keyof typeof LEVEL_WEIGHT;

const FALLBACK_LEVEL: LogLevel = 'info';

function parseLogLevel(raw: string | undefined | null): LogLevel {
  if (!raw) return FALLBACK_LEVEL;
  const normalized = raw.trim().toLowerCase();
  if (normalized in LEVEL_WEIGHT) {
    return normalized as LogLevel;
  }
  return FALLBACK_LEVEL;
}

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

const noopLogger: Logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

export function createLogger(env: Env | undefined, namespace: string): Logger {
  if (!env) return noopLogger;
  const level = parseLogLevel(env.LOG_LEVEL);
  const threshold = LEVEL_WEIGHT[level];

  const emit = (kind: 'error' | 'warn' | 'info' | 'debug', message: string, meta?: unknown) => {
    const weight = LEVEL_WEIGHT[kind];
    if (threshold < weight) return;
    const payload = meta === undefined ? [] : [meta];
    const formatted = `[${namespace}] ${message}`;
    switch (kind) {
      case 'error':
        console.error(formatted, ...payload);
        break;
      case 'warn':
        console.warn(formatted, ...payload);
        break;
      case 'info':
        console.info(formatted, ...payload);
        break;
      case 'debug':
        console.debug(formatted, ...payload);
        break;
      default:
        break;
    }
  };

  return {
    error: (message, meta) => emit('error', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    info: (message, meta) => emit('info', message, meta),
    debug: (message, meta) => emit('debug', message, meta),
  };
}

export function getNoopLogger() {
  return noopLogger;
}
