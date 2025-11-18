import { Env } from '../../types';

const DEFAULT_API_BASE = 'https://api.mulerun.com';

export async function callMuleRun(env: Env, path: string, method: 'GET' | 'POST', body?: unknown) {
  const apiBase = (env.MULERUN_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
  const url = `${apiBase}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.MULERUN_API_KEY}`,
    Accept: 'application/json',
  };

  const init: RequestInit = { method, headers };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MuleRun API request failed: ${response.status} ${errorText}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}
