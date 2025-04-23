import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './vitest.config.ts',
  './e2e-tests/vitest.config.ts',
  './e2e-tests/test-applications/sveltekit-test-app/vite.config.ts',
  './e2e-tests/test-applications/remix-test-app/vite.config.ts',
]);
