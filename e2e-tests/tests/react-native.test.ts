import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
  checkFileContents,
  checkIfReactNativeBundles,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';
import { afterAll, beforeAll, describe, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('ReactNative', () => {
  const integration = Integration.reactNative;
  let wizardExitCode: number;
  const { projectDir, cleanup } = createIsolatedTestEnv(
    'react-native-test-app',
  );

  beforeAll(async () => {
    wizardExitCode = await withEnv({
      cwd: projectDir,
      debug: true,
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
      .whenAsked('Do you want to run `pod install` now?')
      .respondWith(KEYS.ENTER)
      .expectOutput('Added Sentry.init to App.tsx', { timeout: 240_000 })
      .whenAsked(
        'Looks like you have Prettier in your project. Do you want to run it on your files?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER)
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
      .run(getWizardCommand(integration));
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

  test('metro.config.js is updated correctly', () => {
    checkFileContents(
      `${projectDir}/metro.config.js`,
      `const {
 withSentryConfig
} = require("@sentry/react-native/metro");`,
    );
    checkFileContents(
      `${projectDir}/metro.config.js`,
      `module.exports = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));`,
    );
  });

  test('App.tsx is updated correctly', () => {
    checkFileContents(
      `${projectDir}/App.tsx`,
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
      `${projectDir}/App.tsx`,
      `export default Sentry.wrap(App);`,
    );
  });

  test('ios/sentry.properties is added', () => {
    checkFileContents(
      `${projectDir}/ios/sentry.properties`,
      `auth.token=${TEST_ARGS.AUTH_TOKEN}

defaults.org=${TEST_ARGS.ORG_SLUG}
defaults.project=${TEST_ARGS.PROJECT_SLUG}

defaults.url=https://sentry.io/`,
    );
  });

  test('android/sentry.properties is added', () => {
    checkFileContents(
      `${projectDir}/android/sentry.properties`,
      `auth.token=${TEST_ARGS.AUTH_TOKEN}

defaults.org=${TEST_ARGS.ORG_SLUG}
defaults.project=${TEST_ARGS.PROJECT_SLUG}

defaults.url=https://sentry.io/`,
    );
  });

  test('build.gradle is updated correctly', () => {
    checkFileContents(
      `${projectDir}/android/app/build.gradle`,
      `apply from: new File(["node", "--print", "require.resolve('@sentry/react-native/package.json')"].execute().text.trim(), "../sentry.gradle")`,
    );
  });

  test('xcode project is updated correctly', () => {
    checkFileContents(
      `${projectDir}/ios/reactnative078.xcodeproj/project.pbxproj`,
      `@sentry/react-native/scripts/sentry-xcode.sh`,
    );
    checkFileContents(
      `${projectDir}/ios/reactnative078.xcodeproj/project.pbxproj`,
      `../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh`,
    );
  });

  test('android project is bundled correctly', async () => {
    const bundled = await checkIfReactNativeBundles(projectDir, 'android');
    expect(bundled).toBe(true);
  });

  test('ios project is bundled correctly', async () => {
    const bundled = await checkIfReactNativeBundles(projectDir, 'ios');
    expect(bundled).toBe(true);
  });
});
