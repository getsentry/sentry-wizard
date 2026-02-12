import { execSync } from 'node:child_process';
import { Integration } from '../../lib/Constants';
import {
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { withEnv } from 'clifty';

describe('TanStack Start', () => {
  let wizardExitCode: number;
  const { projectDir, cleanup } = createIsolatedTestEnv(
    'tanstack-start-test-app',
  );

  beforeAll(async () => {
    execSync('npm install', { cwd: projectDir, stdio: 'pipe' });

    wizardExitCode = await withEnv({ cwd: projectDir })
      .defineInteraction()
      .expectOutput('TanStack Start support is coming soon')
      .run(getWizardCommand(Integration.tanstackStart));
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
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
