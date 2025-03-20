import * as path from 'node:path';
/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import { KEYS, cleanupGit, revertLocalChanges } from '../utils';
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
        {
          timeout: 60_000,
          optional: true,
        },
      ));
    let podInstallInput = [''];
    if (podInstallPrompted) {
      podInstallInput = [KEYS.DOWN, KEYS.ENTER];
    }
    const prettierPrompted =
      podInstallPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Skip pod install
        podInstallInput,
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

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});`,
    );
    checkFileContents(
      `${projectDir}/App.tsx`,
      `export default Sentry.wrap(App);`,
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
