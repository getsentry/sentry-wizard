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
  checkIfFlutterBuilds,
} from '../utils';
import * as path from 'path';
import * as fs from 'fs';

describe('Flutter', () => {
  const integration = Integration.flutter;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/flutter-test-app',
  );

  describe('with apple platforms', () => {
    beforeAll(async () => {
      const wizardInstance = startWizardInstance(integration, projectDir);
  
      const tracingOptionPrompted = await wizardInstance.waitForOutput(
        // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
        'to track the performance of your application?',
      );
  
      const profilingOptionPrompted = tracingOptionPrompted &&
        (await wizardInstance.sendStdinAndWaitForOutput(
          [KEYS.ENTER],
          // "Do you want to enable Profiling", sometimes doesn't work as `Profiling` can be printed in bold.
          'to analyze CPU usage and optimize performance-critical code on iOS & macOS?',
        ));
  
      profilingOptionPrompted &&
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
  
    test('sentry.properties exists and has auth token', () => {
      checkSentryProperties(projectDir);
    });
  
    test('.gitignore has sentry.properties', () => {
      checkFileContents(`${projectDir}/.gitignore`, `sentry.properties`);
    });
    
    test('lib/main.dart calls sentry init', () => {
      checkFileContents(`${projectDir}/lib/main.dart`, `import 'package:sentry_flutter/sentry_flutter.dart';`);
      checkFileContents(`${projectDir}/lib/main.dart`, `await SentryFlutter.init(`);
    });
  
    test('lib/main.dart enables tracing and profiling', () => {
      checkFileContents(`${projectDir}/lib/main.dart`, `options.tracesSampleRate = 1.0;`);
      checkFileContents(`${projectDir}/lib/main.dart`, `options.profilesSampleRate = 1.0;`);
    });
  
    test('builds correctly', async () => {
      await checkIfFlutterBuilds(projectDir, '✓ Built build/web');
    });
  });

  describe('without apple platforms', () => {
    beforeAll(async () => {
      
      const wizardInstance = startWizardInstance(integration, projectDir, true);
  
      if (fs.existsSync(`${projectDir}/ios`)) {
        fs.renameSync(`${projectDir}/ios`, `${projectDir}/_ios`);
      }
      if (fs.existsSync(`${projectDir}/macos`)) {
        fs.renameSync(`${projectDir}/macos`, `${projectDir}/_macos`);
      }

      const continueOnUncommitedFilesPromted = await wizardInstance.waitForOutput(
        'Do you want to continue anyway?'
      )

      const tracingOptionPrompted = continueOnUncommitedFilesPromted &&
        (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
        'to track the performance of your application?',
        ));
  
      tracingOptionPrompted &&
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

    test('lib/main.dart does not add profiling with missing ios and macos folder', () => {
      const fileContent = fs.readFileSync(`${projectDir}/lib/main.dart`, 'utf-8');
      expect(fileContent).not.toContain(`options.profilesSampleRate = 1.0;`);
    });
  });
});
