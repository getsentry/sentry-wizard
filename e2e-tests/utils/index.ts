import * as fs from 'fs';
import * as path from 'path';
import { runner } from 'clet';

import type { Integration } from '../../lib/Constants';
import { expect } from 'chai';

// Default enter key (EOL) is not working for some reason
export const KEYS = {
  UP: '\u001b[A',
  DOWN: '\u001b[B',
  LEFT: '\u001b[D',
  RIGHT: '\u001b[C',
  ENTER: '\r',
  SPACE: ' ',
};

export const TEST_ARGS = {
  AUTH_TOKEN: 'TEST_AUTH_TOKEN',
  PROJECT_DSN: 'https://public@dsn.ingest.sentry.io/1337',
};

export const log = (message: string) => {
  console.debug(`[TEST] ${message}`);
};

/**
 * Initialize a git repository in the given directory
 * @param projectDir
 */
export async function initGit(projectDir: string): Promise<void> {
  try {
    await runner().cwd(projectDir).spawn('git', ['init'], {});
    await runner().cwd(projectDir).spawn('git', ['add', '-A'], {});
    // Add author info to avoid git commit error
    await runner()
      .cwd(projectDir)
      .spawn('git', ['config', 'user.email', ''], {});
    await runner()
      .cwd(projectDir)
      .spawn('git', ['config', 'user.name', ''], {});

    await runner().cwd(projectDir).spawn('git', ['commit', '-m', 'init'], {});
  } catch (e) {
    // ignore
  }
}

/**
 * Cleanup the git repository in the given directory
 * @param projectDir
 */
export async function cleanupGit(projectDir: string): Promise<void> {
  try {
    await runner().cwd(projectDir).spawn(`rm -rf ${projectDir}/.git`, [], {});
  } catch (e) {
    // ignore
  }
}

/**
 * Revert local changes in the given directory
 *
 * Caution! Make sure `projectDir` is a test project directory,
 * if in doubt, please commit your local non-test changes first!
 *
 * @param projectDir
 */
export async function revertLocalChanges(projectDir: string): Promise<void> {
  try {
    // Revert tracked files
    await runner().cwd(projectDir).spawn('git', ['checkout', '.'], {});
    // Revert untracked files
    await runner().cwd(projectDir).spawn('git', ['clean', '-fd', '.'], {});
  } catch (e) {
    // ignore
  }
}

/**
 * Run the wizard with the given integration and project directory
 *
 * @param integration
 * @param projectDir
 * @returns clet runner instance
 */
export async function runWizard(integration: Integration, projectDir: string) {
  try {
    const binPath = path.join(__dirname, '../../dist/bin.js');

    await revertLocalChanges(projectDir);
    await cleanupGit(projectDir);
    await initGit(projectDir);

    const runnerInstance = runner()
      .cwd(projectDir)
      .spawn(
        'node',
        [
          binPath,
          '--debug',
          '-i',
          integration,
          '--preSelectedProject.authToken',
          TEST_ARGS.AUTH_TOKEN,
          '--preSelectedProject.dsn',
          TEST_ARGS.PROJECT_DSN,
        ],
        {},
      )
      .stdin(/Do you want to create an example page/, [KEYS.ENTER, KEYS.ENTER])
      .wait(
        'stdout',
        'Sentry has been successfully configured for your Remix project.',
      )
      .kill();

    return runnerInstance;
  } catch (e) {
    await revertLocalChanges(projectDir);
    await cleanupGit(projectDir);
  }
}

/**
 * Read the file contents and check if it contains the given content
 *
 * @param filePath
 * @param content
 */
export async function checkFileContents(
  filePath: string,
  content: string | string[],
) {
  log(`Checking file contents for ${filePath}`);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const contentArray = Array.isArray(content) ? content : [content];

  for (const c of contentArray) {
    expect(fileContent).contain(c);
  }
}

/**
 * Check if the file exists
 *
 * @param filePath
 */
export async function checkFileExists(filePath: string) {
  log(`Checking if ${filePath} exists`);
  expect;
  expect(fs.existsSync(filePath)).to.be.true;
}

/**
 * Check if the package.json contains the given integration
 * @param projectDir
 * @param integration
 */
export async function checkPackageJson(
  projectDir: string,
  integration: Integration,
) {
  log(`Checking package.json for @sentry/${integration}`);
  checkFileContents(`${projectDir}/package.json`, `@sentry/${integration}`);
}

/**
 * Check if the .sentryclirc contains the auth token
 * @param projectDir
 */
export async function checkSentryCliRc(projectDir: string) {
  log('Checking .sentryclirc for auth token');
  checkFileContents(
    `${projectDir}/.sentryclirc`,
    `token=${TEST_ARGS.AUTH_TOKEN}`,
  );
}

/**
 * Check if the project builds
 * @param projectDir
 */
export async function checkIfBuilds(projectDir: string) {
  log('Checking if the project builds');
  await runner().cwd(projectDir).spawn('npm', ['run', 'build'], {});
}

/**
 * Check if the project runs on dev mode
 * @param projectDir
 * @param expectedOutput
 */
export async function checkIfRunsOnDevMode(
  projectDir: string,
  expectedOutput: string,
) {
  log('Checking if the project runs on dev mode');
  await runner()
    .cwd(projectDir)
    .spawn('npm', ['run', 'dev'], {})
    .wait('stdout', expectedOutput)
    .kill();
}

/**
 * Check if the project runs on prod mode
 * @param projectDir
 * @param expectedOutput
 */
export async function checkIfRunsOnProdMode(
  projectDir: string,
  expectedOutput: string,
) {
  log('Checking if the project runs on prod mode');
  await runner()
    .cwd(projectDir)
    .spawn('npm', ['run', 'start'], {})
    .wait('stdout', expectedOutput)
    .kill();
}
