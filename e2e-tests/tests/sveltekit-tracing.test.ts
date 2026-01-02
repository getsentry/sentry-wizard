import * as path from 'node:path';
import * as fs from 'node:fs';
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
  TEST_ARGS,
} from '../utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Sveltekit with instrumentation and tracing', () => {
  describe('without existing files', () => {
    const integration = Integration.sveltekit;
    let wizardExitCode: number;

    const { projectDir, cleanup } = createIsolatedTestEnv('sveltekit-tracing-test-app');

    beforeAll(async () => {

      wizardExitCode = await withEnv({
        cwd: projectDir,
      })
        .defineInteraction()
        .expectOutput(
          'The Sentry SvelteKit Wizard will help you set up Sentry for your application',
        )
        .step('package installation', ({ expectOutput, whenAsked }) => {
          whenAsked('Please select your package manager.').respondWith(
            KEYS.DOWN,
            KEYS.ENTER,
          );
          expectOutput('Installing @sentry/sveltekit');
        })
        .step('SDK setup', ({ whenAsked }) => {
          whenAsked('Do you want to enable Tracing', {
            timeout: 90_000, // package installation can take a while in CI
          }).respondWith(KEYS.ENTER);
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
      cleanup();
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
      checkFileContents(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
        // svelte 5 specific syntax
        ['let hasSentError = $state(false);', 'onclick={getSentryData}'],
      );
    });

    it('adds the sentry plugin to vite.config.ts', () => {
      const viteConfig = fs.readFileSync(
        path.resolve(projectDir, 'vite.config.ts'),
      );
      expect(viteConfig.toString()).toMatchInlineSnapshot(`
        "import { sentrySvelteKit } from "@sentry/sveltekit";
        import { sveltekit } from '@sveltejs/kit/vite';
        import { defineConfig } from 'vite';

        export default defineConfig({
        	plugins: [sentrySvelteKit({
                org: "${TEST_ARGS.ORG_SLUG}",
                project: "${TEST_ARGS.PROJECT_SLUG}"
            }), sveltekit()]
        });"
      `);
    });

    it('creates the hook files', () => {
      const clientHooks = fs.readFileSync(
        path.resolve(projectDir, 'src/hooks.client.ts'),
      );
      const serverHooks = fs.readFileSync(
        path.resolve(projectDir, 'src/hooks.server.ts'),
      );

      expect(clientHooks.toString()).toMatchInlineSnapshot(`
        "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
        import * as Sentry from '@sentry/sveltekit';

        Sentry.init({
          dsn: '${TEST_ARGS.PROJECT_DSN}',

          tracesSampleRate: 1.0,

          // Enable logs to be sent to Sentry
          enableLogs: true,

          // This sets the sample rate to be 10%. You may want this to be 100% while
          // in development and sample at a lower rate in production
          replaysSessionSampleRate: 0.1,

          // If the entire session is not sampled, use the below sample rate to sample
          // sessions when an error occurs.
          replaysOnErrorSampleRate: 1.0,

          // If you don't want to use Session Replay, just remove the line below:
          integrations: [replayIntegration()],

          // Enable sending user PII (Personally Identifiable Information)
          // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
          sendDefaultPii: true,
        });

        // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
        export const handleError = handleErrorWithSentry();
        "
      `);

      expect(serverHooks.toString()).toMatchInlineSnapshot(`
        "import {sequence} from "@sveltejs/kit/hooks";
        import * as Sentry from "@sentry/sveltekit";
        export const handle = sequence(Sentry.sentryHandle(), async ({ event, resolve }) => {
          const response = await resolve(event);
          return response;
        });
        export const handleError = Sentry.handleErrorWithSentry();"
      `);
    });

    it('creates the insturmentation.server file', () => {
      const instrumentationServer = fs.readFileSync(
        path.resolve(projectDir, 'src/instrumentation.server.ts'),
      );

      expect(instrumentationServer.toString()).toMatchInlineSnapshot(`
        "import * as Sentry from '@sentry/sveltekit';

        Sentry.init({
          dsn: '${TEST_ARGS.PROJECT_DSN}',

          tracesSampleRate: 1.0,

          // Enable logs to be sent to Sentry
          enableLogs: true,

          // uncomment the line below to enable Spotlight (https://spotlightjs.com)
          // spotlight: import.meta.env.DEV,
        });"
      `);
    });

    it('enables tracing and instrumentation in svelte.config.js', () => {
      const svelteConfig = fs.readFileSync(
        path.resolve(projectDir, 'svelte.config.js'),
      );
      expect(svelteConfig.toString()).toMatchInlineSnapshot(`
        "import adapter from '@sveltejs/adapter-node';
        import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

        /** @type {import('@sveltejs/kit').Config} */
        const config = {
          // Consult https://svelte.dev/docs/kit/integrations#preprocessors
          // for more information about preprocessors
          preprocess: vitePreprocess(),

          kit: {
            // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
            // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
            // See https://svelte.dev/docs/kit/adapters for more information about adapters.
            adapter: adapter(),
            experimental: {
              remoteFunctions: true,

              tracing: {
                server: true,
              },

              instrumentation: {
                server: true,
              },
            },
          },
        };

        export default config;"
      `);
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
