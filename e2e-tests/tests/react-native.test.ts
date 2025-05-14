import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  TEST_ARGS,
  cleanupGit,
  checkFileContents,
  checkIfReactNativeBundles,
  checkIfReactNativeReleaseBuilds,
  revertLocalChanges,
  startWizardInstance
} from '../utils';
import { afterAll, beforeAll, describe, test, expect } from 'vitest';

describe('ReactNative', () => {
  const integration = Integration.reactNative;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/react-native-test-app',
  );

  let podInstallPrompted = false;

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
    const sessionReplayPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
        'Do you want to enable Session Replay to help debug issues? (See https://docs.sentry.io/platforms/react-native/session-replay/)',
      ));

    const feedbackWidgetPrompted =
      sessionReplayPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Enable session replay
        [KEYS.ENTER],
        'Do you want to enable the Feedback Widget to collect feedback from your users? (See https://docs.sentry.io/platforms/react-native/user-feedback/)',
      ));

    podInstallPrompted =
      feedbackWidgetPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Enable feedback widget
        [KEYS.ENTER],
        'Do you want to run `pod install` now?',
        {
          optional: true,
          timeout: 5000,
        },
      ));

    const prettierPrompted =
      podInstallPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Pod install
        [KEYS.ENTER],
        'Looks like you have Prettier in your project. Do you want to run it on your files?',
      ));

    const testEventPrompted =
      prettierPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Skip prettier
        [KEYS.DOWN, KEYS.ENTER],
        'Have you successfully sent a test event?',
      ));

    testEventPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Respond that test event was sent
        [KEYS.ENTER],
        'Everything is set up!',
      ));
    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
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
    if (!podInstallPrompted) {
      return;
    }
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
    if (!podInstallPrompted) {
      return;
    }
    checkFileContents(
      `${projectDir}/ios/reactnative078.xcodeproj/project.pbxproj`,
      `../node_modules/@sentry/react-native/scripts/sentry-xcode.sh`,
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

  test('android project builds correctly', async () => {
    const builds = await checkIfReactNativeReleaseBuilds(projectDir, 'android');
    expect(builds).toBe(true);
  });

  test('ios project builds correctly', { timeout: 1_200_000 }, async () => {
    if (!podInstallPrompted) {
      return;
    }
    const builds = await checkIfReactNativeReleaseBuilds(projectDir, 'ios');
    expect(builds).toBe(true);
  });
});
