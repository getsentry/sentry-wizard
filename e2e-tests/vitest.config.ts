import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'bin.ts', 'index.ts'],
      ignoreEmptyLines: true,
      enabled: true,
      reporter: ['lcov', 'clover', 'json', 'json-summary'],
    },
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 360_000,
    hookTimeout: 360_000,
  },
});
