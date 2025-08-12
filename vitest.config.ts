import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ...(process.env.CI && { NO_COLOR: '1' }),
    },
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'bin.ts', 'index.ts'],
      ignoreEmptyLines: true,
      enabled: true,
      reporter: ['lcov', 'clover', 'json', 'json-summary', 'text'],
    },
    include: ['lib/**/__tests__/**/*.ts', 'test/**/*.test.ts'],
    exclude: ['./e2e-tests/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
