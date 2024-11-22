import * as path from 'path';
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  KEYS,
  revertLocalChanges,
  startWizardInstance,
  TEST_ARGS,
} from '../utils';

async function runWizardOnNuxtProject(projectDir: string): Promise<void> {
  const integration = Integration.nuxt;

  const wizardInstance = startWizardInstance(integration, projectDir);
  const packageManagerPrompted = await wizardInstance.waitForOutput(
    'Please select your package manager.',
  );

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // Selecting `yarn` as the package manager
      [KEYS.DOWN, KEYS.ENTER],
      // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
      'to track the performance of your application?',
      {
        timeout: 240_000,
      },
    ));

  const replayOptionPrompted =
    tracingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
      'to get a video-like reproduction of errors during a user session?',
    ));

  replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to create an example page',
      {
        optional: true,
      },
    ));

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER, KEYS.ENTER],
    'Successfully installed the Sentry Nuxt SDK!',
  );

  wizardInstance.kill();
}

function testNuxtProjectSetup(projectDir: string) {
  const integration = Integration.nuxt;

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);
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
}

describe('Nuxt3', () => {
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nuxt-3-test-app',
  );

  beforeAll(async () => {
    await runWizardOnNuxtProject(projectDir);
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  testNuxtProjectSetup(projectDir);

  test('nuxt config contains sentry module', () => {
    checkFileContents(path.resolve(projectDir, 'nuxt.config.ts'), [
      "modules: ['@sentry/nuxt/module'],",
      'sentry: {',
      '  sourceMapsUploadOptions: {',
      `    org: '${TEST_ARGS.ORG_SLUG}',`,
      `    project: '${TEST_ARGS.PROJECT_SLUG}'`,
      '  }',
      '},',
      'sourcemap: {',
      '  client: true',
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
      "  // Setting this option to true will print useful information to the console while you're setting up Sentry.",
      '  debug: false,',
      '});',
    ]);
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir, 'preview this build');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Listening on');
  });
});
