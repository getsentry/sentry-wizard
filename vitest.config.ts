import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'bin.ts', 'index.ts'],
      ignoreEmptyLines: true,
      enabled: true,
      reporter: ['lcov', 'clover', 'json', 'json-summary'],
    },
    include: ['lib/**/__tests__/**/*.ts', 'test/**/*.test.ts'],
    exclude: ['./e2e-tests/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
