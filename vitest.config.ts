import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    reporters: 'default',
    setupFiles: ['./tests/setup/vitest.setup.ts'],
  },
});
