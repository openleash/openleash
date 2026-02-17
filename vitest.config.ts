import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    include: ['packages/*/test/**/*.test.ts'],
  },
});
