import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
  checkFileContents,
  checkFileExists,
  checkIfExpoBundles,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';
import { afterAll, beforeAll, describe, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Expo', () => {
  let wizardExitCode: number;
  const { projectDir, cleanup } = createIsolatedTestEnv(
    'react-native-expo-test-app',
  );

  beforeAll(async () => {
    wizardExitCode = await withEnv({
      cwd: projectDir,
    })
      .defineInteraction()

      .whenAsked('Please select your package manager.')
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .expectOutput('Installing @sentry/react-native')
      .expectOutput('Installed @sentry/react-native', {
        timeout: 240_000,
      })

      .whenAsked('Do you want to enable Session Replay')
      .respondWith(KEYS.ENTER)
      .whenAsked(
        'Do you want to enable the Feedback Widget to collect feedback from your users?',
      )
      .respondWith(KEYS.ENTER)
      .whenAsked('Do you want to enable Logs')
      .respondWith(KEYS.ENTER)
      .expectOutput('Added Sentry.init to app/_layout.tsx')
      .expectOutput('Added Sentry Expo plugin to app.config.json')
      .expectOutput('Added .env.local to .gitignore')
      .expectOutput('Written .env.local')
      .expectOutput('Created metro.config.js with Sentry configuration')

      .whenAsked(
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER)

      .expectOutput(
        'To make sure everything is set up correctly, put the following code snippet into your application.',
      )
      .whenAsked('Have you successfully sent a test event?')
      .respondWith(KEYS.ENTER)
      .expectOutput('Everything is set up!')

      .run(getWizardCommand(Integration.reactNative));
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  test('package.json is updated correctly', () => {
    checkFileContents(`${projectDir}/package.json`, `@sentry/react-native`);
  });

  test('_layout.tsx is updated correctly', () => {
    checkFileContents(
      `${projectDir}/app/_layout.tsx`,
      `import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});`,
    );
    checkFileContents(
      `${projectDir}/app/_layout.tsx`,
      `export default Sentry.wrap(function RootLayout() {`,
    );
  });

  test('app.json is updated correctly', () => {
    checkFileContents(
      `${projectDir}/app.json`,
      `"@sentry/react-native/expo",
        {
          "url": "https://sentry.io/",
          "project": "${TEST_ARGS.PROJECT_SLUG}",
          "organization": "${TEST_ARGS.ORG_SLUG}"
        }`,
    );
  });

  test('metro.config.js is added', () => {
    checkFileExists(`${projectDir}/metro.config.js`);
    checkFileContents(
      `${projectDir}/metro.config.js`,
      `const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

module.exports = config;`,
    );
  });

  test('.gitignore is updated correctly', () => {
    checkFileContents(`${projectDir}/.gitignore`, `.env.local`);
  });

  test('android project is bundled correctly', async () => {
    const bundled = await checkIfExpoBundles(projectDir, 'android');
    expect(bundled).toBe(true);
  });

  test('ios project is bundled correctly', async () => {
    const bundled = await checkIfExpoBundles(projectDir, 'ios');
    expect(bundled).toBe(true);
  });

  test('web project is bundled correctly', async () => {
    const bundled = await checkIfExpoBundles(projectDir, 'web');
    expect(bundled).toBe(true);
  });
});
