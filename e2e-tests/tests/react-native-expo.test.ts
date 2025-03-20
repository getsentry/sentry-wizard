import * as path from 'node:path';
/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  checkFileExists,
  cleanupGit,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import { checkFileContents } from '../utils';

describe('Expo', () => {
  const integration = Integration.reactNative;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/react-native-expo-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
    const testEventPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
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

  test('_layout.tsx is updated correctly', () => {
    checkFileContents(
      `${projectDir}/app/_layout.tsx`,
      `import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',

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
    checkFileContents(`${projectDir}/app.json`,`"@sentry/react-native/expo"`);
    checkFileContents(`${projectDir}/app.json`,`"url": "https://sentry.io/"`);
    checkFileContents(`${projectDir}/app.json`,`"project": "TEST_PROJECT_SLUG"`);
    checkFileContents(`${projectDir}/app.json`,`"organization": "TEST_ORG_SLUG"`);
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
});
