import { afterAll, afterEach, beforeAll } from 'vitest';
import { server, TEST_BASE_URL } from './msw-server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const originalFetch = globalThis.fetch;
if (!originalFetch) {
  throw new Error('Global fetch is required for tests.');
}

globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    const absolute = new URL(input, TEST_BASE_URL).toString();
    return originalFetch(absolute, init);
  }
  if (input instanceof Request && input.url.startsWith('/')) {
    const absolute = new URL(input.url, TEST_BASE_URL).toString();
    const redirected = new Request(absolute, input);
    return originalFetch(redirected, init);
  }
  return originalFetch(input, init);
};
