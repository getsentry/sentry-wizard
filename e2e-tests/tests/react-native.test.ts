import * as path from 'node:path';
/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  cleanupGit,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import { checkFileContents } from '../utils';

describe('ReactNative', () => {
  const integration = Integration.reactNative;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/react-native-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
    const prettierPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
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
});
