/* eslint-disable jest/expect-expect */
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
import * as path from 'path';

describe('Sveltekit', () => {
  const integration = Integration.sveltekit;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/sveltekit-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);

    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
      {
        optional: true,
      }
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
        }
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
      'Successfully installed the Sentry SvelteKit SDK!',
    );

    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  test('should have the correct package.json', () => {
    checkPackageJson(projectDir, integration);
  });

  test('should have the correct .env.sentry-build-plugin', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('example page exists', () => {
    checkFileExists(path.resolve(projectDir, 'src/routes/sentry-example/+page.svelte'));
    checkFileExists(path.resolve(projectDir, 'src/routes/sentry-example/+server.js'));
  });

  test('vite.config contains sentry plugin', () => {
    checkFileContents(path.resolve(projectDir, 'vite.config.ts'), `plugins: [sentrySvelteKit({
        sourceMapsUploadOptions: {
`);
  });

  test('hook files created', () => {
    checkFileExists(path.resolve(projectDir, 'src/hooks.server.ts'));
    checkFileExists(path.resolve(projectDir, 'src/hooks.client.ts'));
  });

  test('hooks.client.ts contains sentry import', () => {
    checkFileContents(
      path.resolve(projectDir, 'src/hooks.client.ts'),
      [`import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
  dsn: '${TEST_ARGS.PROJECT_DSN}',

  tracesSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // If you don't want to use Session Replay, just remove the line below:
  integrations: [replayIntegration()],
});`]);
  });


  test('hooks.server.ts contains sentry import', () => {
    checkFileContents(
      path.resolve(projectDir, 'src/hooks.server.ts'),
      [
        `import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
  dsn: '${TEST_ARGS.PROJECT_DSN}',

  tracesSampleRate: 1.0,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: import.meta.env.DEV,
});`])
  });


  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'ready in');
  });

  test('should build successfully', async () => {
    await checkIfBuilds(projectDir, 'Successfully uploaded source maps to Sentry');
  });

  test('runs on prod mode correctly', async () => {
    // We can't use the full prompt `Network: use--host to expose` as `--host` can be printed in bold.
    await checkIfRunsOnProdMode(projectDir, 'to expose', "preview");
  });
});

