import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  createFile,
  getWizardCommand,
  initGit,
  revertLocalChanges,
} from '../utils';
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

function checkSvelteKitProject(
  projectDir: string,
  integration: Integration,
  options?: {
    devModeExpectedOutput: string;
    prodModeExpectedOutput: string;
  },
) {
  test('should have the correct package.json', () => {
    checkPackageJson(projectDir, integration);
  });

  test('should have the correct .env.sentry-build-plugin', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('example page exists', () => {
    checkFileExists(
      path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
    );
    checkFileExists(
      path.resolve(projectDir, 'src/routes/sentry-example-page/+server.js'),
    );
  });

  test('vite.config contains sentry plugin', () => {
    checkFileContents(
      path.resolve(projectDir, 'vite.config.ts'),
      `plugins: [sentrySvelteKit({
        sourceMapsUploadOptions: {
`,
    );
  });

  test('hook files created', () => {
    checkFileExists(path.resolve(projectDir, 'src/hooks.server.ts'));
    checkFileExists(path.resolve(projectDir, 'src/hooks.client.ts'));
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(
      projectDir,
      options?.devModeExpectedOutput || 'ready in',
    );
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(
      projectDir,
      options?.prodModeExpectedOutput || 'to expose',
      'preview',
    );
  });
}

describe('Sveltekit with instrumentation and tracing', () => {
  describe('without existing files', () => {
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-tracing-test-app',
    );

    let wizardExitCode: number;

    beforeAll(async () => {
      initGit(projectDir);
      revertLocalChanges(projectDir);

      wizardExitCode = await withEnv({ cwd: projectDir, debug: true })
        .defineInteraction()
        .step('intro', ({ expectOutput }) => {
          expectOutput(
            'The Sentry SvelteKit Wizard will help you set up Sentry for your application',
          );
        })
        .step('package manager selection', ({ whenAsked }) => {
          whenAsked('Please select your package manager.').respondWith(
            KEYS.DOWN,
            KEYS.ENTER,
          );
        })
        .step('SDK setup', ({ whenAsked }) => {
          whenAsked('Do you want to enable Tracing').respondWith(KEYS.ENTER);
          whenAsked('Do you want to enable Session Replay').respondWith(
            KEYS.ENTER,
          );
          whenAsked('Do you want to enable Logs').respondWith(KEYS.ENTER);
        })
        .step('example page creation', ({ whenAsked }) => {
          whenAsked('Do you want to create an example page').respondWith(
            KEYS.ENTER,
          );
        })
        .step('MCP', ({ whenAsked }) => {
          whenAsked(
            'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
          ).respondWith(KEYS.DOWN, KEYS.ENTER);
        })
        .expectOutput('Successfully installed the Sentry SvelteKit SDK!')
        .run(getWizardCommand(Integration.sveltekit));
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    it('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    // checkSvelteKitProject(projectDir, integration);
  });
});
