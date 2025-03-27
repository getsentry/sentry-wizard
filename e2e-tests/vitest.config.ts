import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 360_000,
    hookTimeout: 360_000,
  },
});
