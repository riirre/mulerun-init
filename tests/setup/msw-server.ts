import { setupServer } from 'msw/node';

export const TEST_BASE_URL = 'https://example.test';

export const server = setupServer();
