import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnProdMode,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Nuxt-3', () => {
  let wizardExitCode: number;
  const { projectDir, cleanup } = createIsolatedTestEnv('nuxt-3-test-app');

  beforeAll(async () => {
    wizardExitCode = await withEnv({
      cwd: projectDir,
    })
      .defineInteraction()
      .expectOutput(
        'The Sentry Nuxt Wizard will help you set up Sentry for your application',
      )
      .whenAsked('Please select your package manager.')
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .whenAsked('Do you want to add an override for @vercel/nft')
      .respondWith(KEYS.ENTER)
      .expectOutput('Installing @sentry/nuxt')
      .expectOutput('Installed @sentry/nuxt', {
        timeout: 240_000,
      })
      .expectOutput('Created .env.sentry-build-plugin')
      .whenAsked('Please select your deployment platform')
      .respondWith(KEYS.DOWN, KEYS.DOWN, KEYS.DOWN, KEYS.ENTER)
      .expectOutput('Added Sentry Nuxt Module to nuxt.config.ts')
      .whenAsked('Do you want to enable Tracing')
      .respondWith(KEYS.ENTER)
      .whenAsked('Do you want to enable Session Replay')
      .respondWith(KEYS.ENTER)
      .whenAsked('Do you want to enable Logs')
      .respondWith(KEYS.ENTER)
      .expectOutput('Created new sentry.server.config.ts')
      .expectOutput('Created new sentry.client.config.ts')
      .whenAsked('Do you want to create an example page')
      .respondWith(KEYS.ENTER)
      .expectOutput('Created pages/index.vue')
      .expectOutput(
        'After building your Nuxt app, you need to --import the Sentry server config file when running your app',
      )
      .whenAsked('Do you want to open the docs?')
      .respondWith(KEYS.RIGHT, KEYS.ENTER) // no
      .whenAsked(
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .expectOutput('Successfully installed the Sentry Nuxt SDK!')
      .run(getWizardCommand(Integration.nuxt));
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, '@sentry/nuxt');
  });

  test('.env-sentry-build-plugin is created and contains the auth token', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('config files created', () => {
    checkFileExists(`${projectDir}/sentry.server.config.ts`);
    checkFileExists(`${projectDir}/sentry.client.config.ts`);
  });

  test('example page exists', () => {
    checkFileExists(`${projectDir}/pages/sentry-example-page.vue`);
    checkFileExists(`${projectDir}/server/api/sentry-example-api.ts`);
  });

  test('nuxt config contains sentry module', () => {
    checkFileContents(path.resolve(projectDir, 'nuxt.config.ts'), [
      "modules: ['@sentry/nuxt/module'],",
      'sentry: {',
      `  org: '${TEST_ARGS.ORG_SLUG}',`,
      `  project: '${TEST_ARGS.PROJECT_SLUG}'`,
      '},',
      'sourcemap: {',
      "  client: 'hidden'",
      '}',
    ]);
  });

  test('sentry.client.config.ts contents', () => {
    checkFileContents(path.resolve(projectDir, 'sentry.client.config.ts'), [
      'import * as Sentry from "@sentry/nuxt";',
      'Sentry.init({',
      '  // If set up, you can use your runtime config here',
      '  // dsn: useRuntimeConfig().public.sentry.dsn,',
      `  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
      '  // We recommend adjusting this value in production, or using tracesSampler',
      '  // for finer control',
      '  tracesSampleRate: 1.0,',
      '  // This sets the sample rate to be 10%. You may want this to be 100% while',
      '  // in development and sample at a lower rate in production',
      '  replaysSessionSampleRate: 0.1,',
      '  // If the entire session is not sampled, use the below sample rate to sample',
      '  // sessions when an error occurs.',
      '  replaysOnErrorSampleRate: 1.0,',
      "  // If you don't want to use Session Replay, just remove the line below:",
      '  integrations: [Sentry.replayIntegration()],',
      '  // Enable logs to be sent to Sentry',
      '  enableLogs: true,',
      `  // Enable sending of user PII (Personally Identifiable Information)`,
      '  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii',
      '  sendDefaultPii: true,',
      "  // Setting this option to true will print useful information to the console while you're setting up Sentry.",
      '  debug: false,',
      '});',
    ]);
  });

  test('sentry.server.config.ts contents', () => {
    checkFileContents(path.resolve(projectDir, 'sentry.server.config.ts'), [
      'import * as Sentry from "@sentry/nuxt";',
      'Sentry.init({',
      `  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
      '  // We recommend adjusting this value in production, or using tracesSampler',
      '  // for finer control',
      '  tracesSampleRate: 1.0,',
      '  // Enable logs to be sent to Sentry',
      '  enableLogs: true,',
      '  // Enable sending of user PII (Personally Identifiable Information)',
      '  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii',
      '  sendDefaultPii: true,',
      "  // Setting this option to true will print useful information to the console while you're setting up Sentry.",
      '  debug: false,',
      '});',
    ]);
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Listening on');
  });
});
