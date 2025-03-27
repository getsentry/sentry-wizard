import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/__tests__/**/*.ts', 'test/**/*.test.ts'],
    exclude: ['./e2e-tests/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
