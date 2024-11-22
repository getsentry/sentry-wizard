import * as path from 'path';
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  checkFileExists,
  checkPackageJson,
  cleanupGit,
  KEYS,
  revertLocalChanges,
  startWizardInstance,
} from '../utils';

describe('Nuxt3', () => {
  const integration = Integration.nuxt;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nuxt-3-test-app',
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
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

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
});
