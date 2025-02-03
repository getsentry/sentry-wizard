/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  cleanupGit,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import * as path from 'path';

describe('Apple SPM SwiftUI', () => {
  const integration = Integration.ios;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/apple-spm-swiftui',
  );

  beforeAll(() => {
    const wizardInstance = startWizardInstance(integration, projectDir);

    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });
});
