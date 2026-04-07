import * as fs from 'node:fs';
import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import { createIsolatedTestEnv, getWizardCommand } from '../utils';
import {
  checkFileContents,
  checkIfFlutterBuilds,
  checkSentryProperties,
} from '../utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Flutter', () => {
  describe('with apple platforms', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv('flutter-test-app');

    beforeAll(async () => {
      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .expectOutput(
          'The Sentry Flutter Wizard will help you set up Sentry for your application',
        )
        .whenAsked('Do you want to enable Tracing')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'to analyze CPU usage and optimize performance-critical code on iOS & macOS?',
        )
        .respondWith(KEYS.ENTER)
        .whenAsked('to record user interactions and debug issues?')
        .respondWith(KEYS.ENTER)
        .whenAsked('to send your application logs to Sentry?')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        )
        .respondWith(KEYS.DOWN, KEYS.ENTER)
        .expectOutput('Successfully installed the Sentry Flutter SDK!')
        .run(getWizardCommand(Integration.flutter));
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
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
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `import 'package:sentry_flutter/sentry_flutter.dart';`,
      );
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `await SentryFlutter.init(`,
      );
    });

    test('lib/main.dart enables tracing and profiling', () => {
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `options.tracesSampleRate = 1.0;`,
      );
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `options.profilesSampleRate = 1.0;`,
      );
    });

    test('lib/main.dart enables logs', () => {
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `options.enableLogs = true;`,
      );
    });

    test('builds correctly', async () => {
      await checkIfFlutterBuilds(projectDir, '✓ Built build/web');
    });
  });

  describe('without apple platforms', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv('flutter-test-app');

    beforeAll(async () => {
      // Remove apple platform directories to simulate non-apple setup
      if (fs.existsSync(`${projectDir}/ios`)) {
        fs.renameSync(`${projectDir}/ios`, `${projectDir}/_ios`);
      }
      if (fs.existsSync(`${projectDir}/macos`)) {
        fs.renameSync(`${projectDir}/macos`, `${projectDir}/_macos`);
      }

      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .whenAsked('Do you want to continue anyway?')
        .respondWith(KEYS.ENTER)
        .expectOutput(
          'The Sentry Flutter Wizard will help you set up Sentry for your application',
        )
        .whenAsked('Do you want to enable Tracing')
        .respondWith(KEYS.ENTER)
        .whenAsked('to record user interactions and debug issues?')
        .respondWith(KEYS.ENTER)
        .whenAsked('to send your application logs to Sentry?')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        )
        .respondWith(KEYS.DOWN, KEYS.ENTER)
        .expectOutput('Successfully installed the Sentry Flutter SDK!')
        .run(getWizardCommand(Integration.flutter));
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('lib/main.dart does not add profiling with missing ios and macos folder', () => {
      const fileContent = fs.readFileSync(
        `${projectDir}/lib/main.dart`,
        'utf-8',
      );
      expect(fileContent).not.toContain(`options.profilesSampleRate = 1.0;`);
    });

    test('lib/main.dart enables logs', () => {
      checkFileContents(
        `${projectDir}/lib/main.dart`,
        `options.enableLogs = true;`,
      );
    });
  });

  describe('with CRLF line endings', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv('flutter-test-app');

    function convertToCrlf(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          convertToCrlf(fullPath);
        } else if (
          /\.(yaml|dart|properties)$/.test(entry.name) ||
          entry.name === '.gitignore'
        ) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          fs.writeFileSync(
            fullPath,
            content.replace(/\r?\n/g, '\r\n'),
            'utf-8',
          );
        }
      }
    }

    beforeAll(async () => {
      convertToCrlf(projectDir);

      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .whenAsked('Do you want to continue anyway?')
        .respondWith(KEYS.ENTER)
        .expectOutput(
          'The Sentry Flutter Wizard will help you set up Sentry for your application',
        )
        .whenAsked('Do you want to enable Tracing')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'to analyze CPU usage and optimize performance-critical code on iOS & macOS?',
        )
        .respondWith(KEYS.ENTER)
        .whenAsked('to record user interactions and debug issues?')
        .respondWith(KEYS.ENTER)
        .whenAsked('to send your application logs to Sentry?')
        .respondWith(KEYS.ENTER)
        .whenAsked(
          'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        )
        .respondWith(KEYS.DOWN, KEYS.ENTER)
        .expectOutput('Successfully installed the Sentry Flutter SDK!')
        .run(getWizardCommand(Integration.flutter));
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('modified files preserve CRLF line endings', () => {
      const textFiles = fs
        .readdirSync(projectDir, { recursive: true, encoding: 'utf-8' })
        .filter(
          (f) =>
            /\.(yaml|dart|properties)$/.test(f) || f.endsWith('.gitignore'),
        );

      expect(textFiles.length).toBeGreaterThan(0);

      const filesWithMixedEndings = textFiles.filter((file) => {
        const content = fs.readFileSync(
          path.join(projectDir, file),
          'utf-8',
        );
        const stripped = content.replace(/\r\n/g, '');
        return stripped.includes('\n');
      });

      expect(filesWithMixedEndings).toEqual([]);
    });
  });
});
