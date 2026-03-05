import { Integration } from '../../lib/Constants';
import {
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('TanStack Start', () => {
  let wizardExitCode: number;
  const { projectDir, cleanup } = createIsolatedTestEnv(
    'tanstack-start-test-app',
  );

  beforeAll(async () => {
    wizardExitCode = await withEnv({ cwd: projectDir })
      .defineInteraction()
      .whenAsked('Please select your package manager.')
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .expectOutput('Installing @sentry/tanstackstart-react')
      .expectOutput('Installed @sentry/tanstackstart-react', {
        timeout: 240_000,
      })
      .expectOutput('Successfully installed the Sentry TanStack Start SDK!')
      .run(getWizardCommand(Integration.tanstackStart));
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, '@sentry/tanstackstart-react');
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
