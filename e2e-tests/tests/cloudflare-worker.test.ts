import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Integration } from '../../lib/Constants';
import {
  checkIfBuilds,
  checkPackageJson,
  cleanupGit,
  getWizardCommand,
  initGit,
  revertLocalChanges,
} from '../utils';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('cloudflare-worker', () => {
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/cloudflare-test-app',
  );

  const integration = Integration.cloudflare;

  let wizardExitCode: number;

  beforeAll(async () => {
    initGit(projectDir);
    revertLocalChanges(projectDir);

    wizardExitCode = await withEnv({
      cwd: projectDir,
    })
      .defineInteraction()
      .expectOutput(
        'The Sentry Cloudflare Wizard will help you set up Sentry for your application',
      )
      .step('package installation', ({ expectOutput, whenAsked }) => {
        whenAsked('Please select your package manager.').respondWith(
          KEYS.DOWN,
          KEYS.ENTER,
        );
        expectOutput('Installing @sentry/cloudflare');
      })
      .step('SDK setup', ({ whenAsked }) => {
        whenAsked('Do you want to enable Tracing', {
          timeout: 90_000, // package installation can take a while in CI
        }).respondWith(KEYS.ENTER);
      })
      .whenAsked(
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .expectOutput(
        'Sentry has been successfully configured for your Cloudflare project.',
      )
      .run(getWizardCommand(integration));
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  it('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  it('adds the SDK dependency to package.json', () => {
    checkPackageJson(projectDir, integration);
  });

  it('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });
});
