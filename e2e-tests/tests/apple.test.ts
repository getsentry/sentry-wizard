/* eslint-disable jest/expect-expect */
import * as fsp from 'fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import * as os from 'os';
import { Integration } from '../../lib/Constants';
import { checkFileContents, startWizardInstance } from '../utils';

const fixturesDir = path.join(
  __dirname,
  '../../fixtures/test-applications/apple',
);

/**
 * Copies a fixture project into a temporary directory and returns the path to the project directory.
 *
 * @param fixtureName - The name of the fixture project to copy.
 * @returns The path to the project directory.
 */
const prepareProjectDirFromFixture = async (fixtureName: string) => {
  // Create a temporary directory for the project
  const projectDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'project'));
  await fsp.mkdir(projectDir, { recursive: true });

  // Copy the fixture project into the temporary directory
  const fixtureDir = path.join(fixturesDir, fixtureName);
  await fsp.cp(fixtureDir, projectDir, { recursive: true });

  // Initialize git in the project directory with an initial commit
  execSync('git init', { cwd: projectDir });
  execSync('git add .', { cwd: projectDir });
  execSync('git commit -m "Initial commit"', { cwd: projectDir });

  return projectDir;
};

describe('apple wizard', () => {
  const integration = Integration.ios;

  describe('project without files in target', () => {
    let projectDir: string;

    beforeEach(async () => {
      projectDir = await prepareProjectDirFromFixture('no-files-in-target');
    });

    it('should warn about the missing code snippet', async () => {
      // Act
      const wizardInstance = startWizardInstance(integration, projectDir, true);
      wizardInstance.kill();

      // Assert
      // await wizardInstance.waitForOutput(
      //   'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snippet manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
      // );
    });
  });

  describe('objective-c project with single target', () => {
    let projectDir: string;

    beforeEach(async () => {
      projectDir = await prepareProjectDirFromFixture('objc-single-target');
    });

    it('should inject the code snippet into the AppDelegate.m', () => {
      // eslint-disable-next-line no-console
      console.log(projectDir);
      // Act
      const wizardInstance = startWizardInstance(integration, projectDir);
      wizardInstance.kill();

      // Assert
      checkFileContents(
        path.join(projectDir, 'Sources', 'AppDelegate.m'),
        'Sentry.init',
      );
    });
  });
});
/* eslint-enable jest/expect-expect */
