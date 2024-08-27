import * as fs from 'fs';
import * as path from 'path';

import type { Integration } from '../../lib/Constants';
import { expect } from 'chai';
import { ChildProcess, spawn, execSync } from 'child_process';
import { dim, green, red } from '../../lib/Helper/Logging';

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

export const log = {
  success: (message: string) => {
    green(`[SUCCESS] ${message}`);
  },
  info: (message: string) => {
    dim(`[INFO] ${message}`);
  },
  error: (message: string) => {
    red(`[ERROR] ${message}`);
  }
};

export class CLITestEnv {
  taskHandle: ChildProcess

  constructor(cmd: string, args: string[], cwd: string) {
    this.taskHandle = spawn(cmd, args, { cwd, stdio: 'pipe' });

    this.taskHandle.stdout.setEncoding('utf-8');
    this.taskHandle.stderr.setEncoding('utf-8');

    this.taskHandle.stdout.pipe(process.stdout);
    this.taskHandle.stderr.pipe(process.stderr);

    return this;
  }

  sendStdin(input: string) {
    this.taskHandle.stdin.write(input);
  }

  waitForOutput(output: string, timeout = 240_000) {
    return new Promise<void>((resolve, reject) => {
      let outputBuffer = '';
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for output: ${output}`));
      }, timeout);

      this.taskHandle.stdout.on('data', (data) => {
        outputBuffer += data;
        if (outputBuffer.includes(output)) {
          clearTimeout(timeoutId);
          resolve();
        }
      });
    });
  }

  kill() {
    this.taskHandle.kill('SIGINT');
  }
}

/**
 * Initialize a git repository in the given directory
 * @param projectDir
 */
export function initGit(projectDir: string): void {
  try {
    execSync('git init', { cwd: projectDir });
    // Add all files to the git repo
    execSync('git add -A', { cwd: projectDir });
    // Add author info to avoid git commit error
    execSync('git config user.email test@test.sentry.io', { cwd: projectDir });
    execSync('git config user.name Test', { cwd: projectDir });
    execSync('git commit -m init', { cwd: projectDir });
  } catch (e) {
    log.error('Error initializing git');
    throw e;
  }
}

/**
 * Cleanup the git repository in the given directory
 * @param projectDir
 */
export function cleanupGit(projectDir: string): void {
  try {
    // Remove the .git directory
    execSync(`rm -rf ${projectDir}/.git`);
  } catch (e) {
    log.error('Error cleaning up git');
    throw e;
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
export function revertLocalChanges(projectDir: string): void {
  try {
    // Revert tracked files
    execSync('git checkout .', { cwd: projectDir });
    // Revert untracked files
    execSync('git clean -fd .', { cwd: projectDir });
  } catch (e) {
    log.error('Error reverting local changes');
    throw e;
  }
}

/**
 * Run the wizard with the given integration and project directory
 *
 * @param integration
 * @param projectDir
 */
export async function runWizard(integration: Integration, projectDir: string) {
  try {
    const binPath = path.join(__dirname, '../../dist/bin.js');

    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
    initGit(projectDir);

    const wizardTestEnv = new CLITestEnv('node', [
      binPath,
      '--debug',
      '-i',
      integration,
      '--preSelectedProject.authToken',
      TEST_ARGS.AUTH_TOKEN,
      '--preSelectedProject.dsn',
      TEST_ARGS.PROJECT_DSN,
    ], projectDir);

    await wizardTestEnv.waitForOutput(
      'Do you want to create an example page',
    );

    wizardTestEnv.sendStdin(KEYS.ENTER);
    wizardTestEnv.sendStdin(KEYS.ENTER);

    wizardTestEnv.kill();
  } catch (e) {
    log.error('Error running the wizard');
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
    throw e;
  }
}

/**
 * Read the file contents and check if it contains the given content
 *
 * @param filePath
 * @param content
 */
export function checkFileContents(
  filePath: string,
  content: string | string[],
) {
  log.info(`Checking file contents for ${filePath}`);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const contentArray = Array.isArray(content) ? content : [content];

  for (const c of contentArray) {
    expect(fileContent).contain(c);
  }
  log.success(`File contents for ${filePath} are correct`);
}

/**
 * Check if the file exists
 *
 * @param filePath
 */
export function checkFileExists(filePath: string) {
  log.info(`Checking if ${filePath} exists`);
  expect(fs.existsSync(filePath)).to.be.true;
  log.success(`${filePath} exists`);
}

/**
 * Check if the package.json contains the given integration
 * @param projectDir
 * @param integration
 */
export function checkPackageJson(projectDir: string, integration: Integration) {
  log.info(`Checking package.json for @sentry/${integration}`);
  checkFileContents(`${projectDir}/package.json`, `@sentry/${integration}`);
  log.success(`package.json contains @sentry/${integration}`);
}

/**
 * Check if the .sentryclirc contains the auth token
 * @param projectDir
 */
export function checkSentryCliRc(projectDir: string) {
  log.info('Checking .sentryclirc for auth token');
  checkFileContents(
    `${projectDir}/.sentryclirc`,
    `token=${TEST_ARGS.AUTH_TOKEN}`,
  );
  log.success('.sentryclirc contains auth token');
}

/**
 * Check if the project builds
 * @param projectDir
 */
export async function checkIfBuilds(projectDir: string, expectedOutput: string) {
  log.info('Checking if the project builds');
  const testEnv = new CLITestEnv('npm', ['run', 'build'], projectDir);

  await testEnv.waitForOutput(expectedOutput, 20_000);
  log.success('Project builds successfully');
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
  log.info('Checking if the project runs on dev mode');
  const testEnv = new CLITestEnv('npm', ['run', 'dev'], projectDir);

  await testEnv.waitForOutput(expectedOutput, 20_000);
  testEnv.kill();
  log.success('Project runs on dev mode');
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
  log.info('Checking if the project runs on prod mode');

  const testEnv = new CLITestEnv('npm', ['run', 'start'], projectDir);

  await testEnv.waitForOutput(expectedOutput, 20_000);
  testEnv.kill();
  log.success('Project runs on prod mode');
}
