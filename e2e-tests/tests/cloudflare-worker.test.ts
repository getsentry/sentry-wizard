import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkIfBuilds,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('cloudflare-worker', () => {
  const integration = Integration.cloudflare;
  let wizardExitCode: number;
  let expectedCompatibilityDate: string;

  const { projectDir, cleanup } = createIsolatedTestEnv('cloudflare-test-app');

  beforeAll(async () => {
    // Capture the date before running the wizard (wizard runs in subprocess)
    expectedCompatibilityDate = new Date().toISOString().slice(0, 10);

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
    cleanup();
  });

  it('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  it('adds the SDK dependency to package.json', () => {
    checkPackageJson(projectDir, '@sentry/cloudflare');
  });

  it('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  it('wrangler.jsonc file contains Sentry configuration', () => {
    checkFileContents(`${projectDir}/wrangler.jsonc`, [
      `"compatibility_date": "${expectedCompatibilityDate}"`,
      '"global_fetch_strictly_public"',
      '"nodejs_als"',
      '"version_metadata": {',
      '"binding": "CF_VERSION_METADATA"',
    ]);
  });
});
