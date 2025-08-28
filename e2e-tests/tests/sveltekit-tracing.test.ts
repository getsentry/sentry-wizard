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

describe('Sveltekit with instrumentation and tracing', () => {
  describe('without existing files', () => {
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-tracing-test-app',
    );

    const integration = Integration.sveltekit;
    let wizardExitCode: number;

    beforeAll(async () => {
      initGit(projectDir);
      revertLocalChanges(projectDir);

      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .expectOutput(
          'The Sentry SvelteKit Wizard will help you set up Sentry for your application',
        )
        .whenAsked('Please select your package manager.')
        .respondWith(KEYS.DOWN, KEYS.ENTER)
        .step('SDK setup', ({ whenAsked }) => {
          whenAsked('Do you want to enable Tracing').respondWith(KEYS.ENTER);
          whenAsked('Do you want to enable Session Replay').respondWith(
            KEYS.ENTER,
          );
          whenAsked('Do you want to enable Logs').respondWith(KEYS.ENTER);
        })
        .whenAsked('Do you want to create an example page')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        )
        .respondWith(KEYS.DOWN, KEYS.ENTER)
        .expectOutput('Successfully installed the Sentry SvelteKit SDK!')
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

    it('adds the .env.sentry-build-plugin', () => {
      checkEnvBuildPlugin(projectDir);
    });

    it('adds the example page', () => {
      checkFileExists(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
      );
      checkFileExists(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+server.js'),
      );
    });

    it('adds the sentry plugin to vite.config.ts', () => {
      checkFileContents(
        path.resolve(projectDir, 'vite.config.ts'),
        `plugins: [sentrySvelteKit({
          sourceMapsUploadOptions: {
  `,
      );
    });

    it('creates the hook files', () => {
      checkFileExists(path.resolve(projectDir, 'src/hooks.server.ts'));
      checkFileExists(path.resolve(projectDir, 'src/hooks.client.ts'));
    });

    it('creates the insturmentation.server file', () => {
      checkFileExists(
        path.resolve(projectDir, 'src/instrumentation.server.ts'),
      );
    });

    // checkSvelteKitProject(projectDir, integration);
    it('builds successfully', async () => {
      await checkIfBuilds(projectDir);
    });

    it('runs on dev mode correctly', async () => {
      await checkIfRunsOnDevMode(projectDir, 'ready in');
    });

    it('runs on prod mode correctly', async () => {
      await checkIfRunsOnProdMode(projectDir, 'to expose', 'preview');
    });
  });
});
