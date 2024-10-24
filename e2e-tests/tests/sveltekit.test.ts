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
    );

    const tracingOptionPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.ENTER],
        'Do you want to enable Tracing',
        {
          timeout: 240_000,
        }
      ));

    const replayOptionPrompted =
      tracingOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Do you want to enable Sentry Session Replay',
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
      [`import * as Sentry from '@sentry/sveltekit';

Sentry.init({
`, 'export const handleError = handleErrorWithSentry();']);
  });


  test('hooks.server.ts contains sentry import', () => {
    checkFileContents(
      path.resolve(projectDir, 'src/hooks.server.ts'),
      [
        `import * as Sentry from '@sentry/sveltekit';

Sentry.init({`,
        'export const handle = sequence(sentryHandle());',
        'export const handleError = handleErrorWithSentry();'
      ])
  });


  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'ready in');
  });

  test('should build successfully', async () => {
    await checkIfBuilds(projectDir, 'Successfully uploaded source maps to Sentry');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Network: use --host to expose', "preview");
  });
});

