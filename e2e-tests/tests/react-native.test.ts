import * as path from 'node:path';
/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import { KEYS, TEST_ARGS, cleanupGit, revertLocalChanges } from '../utils';
import { startWizardInstance } from '../utils';
import { checkFileContents } from '../utils';

describe('ReactNative', () => {
  const integration = Integration.reactNative;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/react-native-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir, true);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
    const podInstallPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
        'Do you want to run `pod install` now?',
      ));
    const prettierPrompted =
      podInstallPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Skip pod install
        [KEYS.DOWN, KEYS.ENTER],
        'Looks like you have Prettier in your project. Do you want to run it on your files?',
        {
          timeout: 240_000,
        },
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
      `${projectDir}/ios/sentry.properties`,
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
      `../node_modules/@sentry/react-native/scripts/sentry-xcode.sh`,
    );
    checkFileContents(
      `${projectDir}/ios/reactnative078.xcodeproj/project.pbxproj`,
      `../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh`,
    );
  });
});
