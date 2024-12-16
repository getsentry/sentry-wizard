/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  // checkEnvBuildPlugin,
  cleanupGit,
  KEYS,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import {
  checkFileContents,
  // checkFileExists,
  checkSentryProperties,
  checkIfFluterBuilds,
} from '../utils';
import * as path from 'path';

describe('Flutter', () => {
  const integration = Integration.flutter;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/flutter-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);

    const tracingOptionPrompted = await wizardInstance.waitForOutput(
      // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
      'to track the performance of your application?',
    );

    const profilingOptionPrompted =
      tracingOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Profiling", sometimes doesn't work as `Profiling` can be printed in bold.
        'to analyze CPU usage and optimize performance-critical code?',
      ));

    const replayOptionPrompted =
      profilingOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
        'to get a video-like reproduction of errors during a user session?',
      ));

    replayOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Successfully installed the Sentry Flutter SDK!',
      ));

    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  test('pubspec.yaml is updated.', () => {
    checkFileContents(`${projectDir}/pubspec.yaml`, `sentry_flutter:`); // dependencies
    checkFileContents(`${projectDir}/pubspec.yaml`, `sentry_dart_plugin:`); // dev_dependencies
    checkFileContents(`${projectDir}/pubspec.yaml`, `sentry:`); // gradle plugin options
  });

  test('sentry.properties file exists', () => {
    checkSentryProperties(projectDir);
  });

  test('.gitignore has sentry.properties', () => {
    checkFileContents(`${projectDir}/.gitignore`, `sentry.properties`);
  });

  test('builds correctly', async () => {
    await checkIfFluterBuilds(projectDir, '✓ Built build/web');
  });
});
