import { Env } from '../types';

const DEFAULT_HOSTS = ['mule-router-assets.muleusercontent.com'];

export function buildAllowedHostSet(env: Env) {
  const hosts = new Set(DEFAULT_HOSTS);
  const raw = env.ASSET_HOST_ALLOWLIST ?? '';
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      try {
        const parsed = new URL(entry.includes('://') ? entry : `https://${entry}`);
        hosts.add(parsed.hostname);
      } catch {
        // ignore invalid host definitions
      }
    });

  if (env.CLOUDFLARE_ASSET_BASE_URL) {
    try {
      const parsed = new URL(env.CLOUDFLARE_ASSET_BASE_URL);
      hosts.add(parsed.hostname);
    } catch {
      // ignore invalid asset base url
    }
  }

  return hosts;
}
