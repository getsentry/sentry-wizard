import { execSync } from 'node:child_process';
import {
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  createIsolatedTestEnv,
} from '../utils';
import { afterAll, beforeAll, describe, test } from 'vitest';

describe('TanStack Start', () => {
  const { projectDir, cleanup } = createIsolatedTestEnv(
    'tanstack-start-test-app',
  );

  beforeAll(() => {
    execSync('npm install', { cwd: projectDir, stdio: 'pipe' });
  });

  afterAll(() => {
    cleanup();
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'ready in');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Listening on');
  });
});
