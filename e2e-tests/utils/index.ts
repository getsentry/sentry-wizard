import * as fs from 'fs';
import * as path from 'path';

import type { Integration } from '../../lib/Constants';
import { spawn, execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { dim, green, red } from '../../lib/Helper/Logging';

export const KEYS = {
  UP: '\u001b[A',
  DOWN: '\u001b[B',
  LEFT: '\u001b[D',
  RIGHT: '\u001b[C',
  ENTER: '\r',
  SPACE: ' ',
};

export const TEST_ARGS = {
  AUTH_TOKEN: process.env.SENTRY_TEST_AUTH_TOKEN || 'TEST_AUTH_TOKEN',
  PROJECT_DSN:
    process.env.SENTRY_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1337',
  ORG_SLUG: process.env.SENTRY_TEST_ORG || 'TEST_ORG_SLUG',
  PROJECT_SLUG: process.env.SENTRY_TEST_PROJECT || 'TEST_PROJECT_SLUG',
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
  },
};

export class WizardTestEnv {
  taskHandle: ChildProcess;

  constructor(
    cmd: string,
    args: string[],
    opts?: {
      cwd?: string;
      debug?: boolean;
    },
  ) {
    this.taskHandle = spawn(cmd, args, { cwd: opts?.cwd, stdio: 'pipe' });

    if (opts?.debug) {
      this.taskHandle.stdout.pipe(process.stdout);
      this.taskHandle.stderr.pipe(process.stderr);
    }
  }

  sendStdin(input: string) {
    this.taskHandle.stdin.write(input);
  }

  /**
   * Sends the input and waits for the output.
   * @returns a promise that resolves when the output was found
   * @throws an error when the output was not found within the timeout
   */
  sendStdinAndWaitForOutput(
    input: string | string[],
    output: string,
    options?: { timeout?: number; optional?: boolean },
  ) {
    const outputPromise = this.waitForOutput(output, options);

    if (Array.isArray(input)) {
      for (const i of input) {
        this.sendStdin(i);
      }
    } else {
      this.sendStdin(input);
    }
    return outputPromise;
  }

  /**
   * Waits for the task to exit with a given `statusCode`.
   *
   * @returns a promise that resolves to `true` if the run ends with the status
   * code, or it rejects when the `timeout` was reached.
   */
  waitForStatusCode(
    statusCode: number | null,
    options: {
      /** Timeout in ms */
      timeout?: number;
    } = {},
  ) {
    const { timeout } = {
      timeout: 60_000,
      ...options,
    };

    return new Promise<boolean>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for status code: ${statusCode}`));
      }, timeout);

      this.taskHandle.on('exit', (code: number | null) => {
        clearTimeout(timeoutId);
        resolve(code === statusCode);
      });
    });
  }

  /**
   * Waits for the provided output with `.includes()` logic.
   *
   * @returns a promise that resolves to `true` if the output was found, `false` if the output was not found within the
   * timeout and `optional: true` is set, or it rejects when the timeout was reached with `optional: false`
   */
  waitForOutput(
    output: string,
    options: {
      /** Timeout in ms */
      timeout?: number;
      /** Whether to always resolve after the timeout, no matter whether the input was actually found or not. */
      optional?: boolean;
    } = {},
  ) {
    const { timeout, optional } = {
      timeout: 60_000,
      optional: false,
      ...options,
    };

    return new Promise<boolean>((resolve, reject) => {
      let outputBuffer = '';
      const timeoutId = setTimeout(() => {
        if (optional) {
          // The output is not found but it's optional so we can resolve the promise with false
          resolve(false);
        } else {
          reject(new Error(`Timeout waiting for output: ${output}`));
        }
      }, timeout);

      this.taskHandle.stdout.on('data', (data) => {
        outputBuffer += data;
        if (outputBuffer.includes(output)) {
          clearTimeout(timeoutId);
          // The output is found so we can resolve the promise with true
          resolve(true);
        }
      });
    });
  }

  kill() {
    this.taskHandle.stdin.destroy();
    this.taskHandle.stderr.destroy();
    this.taskHandle.stdout.destroy();
    this.taskHandle.kill('SIGINT');
    this.taskHandle.unref();
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
    log.error(e);
  }
}

/**
 * Cleanup the git repository in the given directory
 *
 * Caution! Make sure `projectDir` is a test project directory,
 * if in doubt, please commit your local non-test changes first!
 * @param projectDir
 */
export function cleanupGit(projectDir: string): void {
  try {
    // Remove the .git directory
    execSync(`rm -rf ${projectDir}/.git`);
  } catch (e) {
    log.error('Error cleaning up git');
    log.error(e);
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
    log.error(e);
  }
}

/**
 * Start the wizard instance with the given integration and project directory
 * @param integration
 * @param projectDir
 *
 * @returns WizardTestEnv
 */
export function startWizardInstance(
  integration: Integration,
  projectDir: string,
  debug = false,
): WizardTestEnv {
  const binPath = path.join(__dirname, '../../dist/bin.js');

  revertLocalChanges(projectDir);
  cleanupGit(projectDir);
  initGit(projectDir);

  return new WizardTestEnv(
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
      '--preSelectedProject.orgSlug',
      TEST_ARGS.ORG_SLUG,
      '--preSelectedProject.projectSlug',
      TEST_ARGS.PROJECT_SLUG,
    ],
    { cwd: projectDir, debug },
  );
}

/**
 * Create a file with the given content
 *
 * @param filePath
 * @param content
 */
export function createFile(filePath: string, content?: string) {
  return fs.writeFileSync(filePath, content || '');
}

/**
 * Modify the file with the new content
 *
 * @param filePath
 * @param oldContent
 * @param newContent
 */
export function modifyFile(
  filePath: string,
  replaceMap: Record<string, string>,
) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  let newFileContent = fileContent;

  for (const [oldContent, newContent] of Object.entries(replaceMap)) {
    newFileContent = newFileContent.replace(oldContent, newContent);
  }

  fs.writeFileSync(filePath, newFileContent);
}

/**
 * Read the file contents and check if it contains the given content
 *
 * @param {string} filePath
 * @param {(string | string[])} content
 */
export function checkFileContents(
  filePath: string,
  content: string | string[],
) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const contentArray = Array.isArray(content) ? content : [content];

  for (const c of contentArray) {
    expect(fileContent).toContain(c);
  }
}

/**
 * Check if the file exists
 *
 * @param filePath
 */
export function checkFileExists(filePath: string) {
  expect(fs.existsSync(filePath)).toBe(true);
}

/**
 * Check if the package.json contains the given integration
 *
 * @param projectDir
 * @param integration
 */
export function checkPackageJson(projectDir: string, integration: Integration) {
  checkFileContents(`${projectDir}/package.json`, `@sentry/${integration}`);
}

/**
 * Check if the .sentryclirc contains the auth token
 *
 * @param projectDir
 */
export function checkSentryCliRc(projectDir: string) {
  checkFileContents(
    `${projectDir}/.sentryclirc`,
    `token=${TEST_ARGS.AUTH_TOKEN}`,
  );
}

/**
 * Check if the .env.sentry-build-plugin contains the auth token
 * @param projectDir
 */
export function checkEnvBuildPlugin(projectDir: string) {
  checkFileContents(
    `${projectDir}/.env.sentry-build-plugin`,
    `SENTRY_AUTH_TOKEN=${TEST_ARGS.AUTH_TOKEN}`,
  );
}

/**
 * Check if the sentry.properties contains the auth token
 * @param projectDir
 */
export function checkSentryProperties(projectDir: string) {
  checkFileContents(
    `${projectDir}/sentry.properties`,
    `auth_token=${TEST_ARGS.AUTH_TOKEN}`,
  );
}

/**
 * Check if the project builds
 * Check if the project builds and ends with status code 0.
 * @param projectDir
 */
export async function checkIfBuilds(projectDir: string) {
  const testEnv = new WizardTestEnv('npm', ['run', 'build'], {
    cwd: projectDir,
  });

  await expect(
    testEnv.waitForStatusCode(0, {
      timeout: 120_000,
    }),
  ).resolves.toBe(true);
}

/**
 * Check if the flutter project builds
 * @param projectDir
 */
export async function checkIfFlutterBuilds(
  projectDir: string,
  expectedOutput: string,
  debug = false,
) {
  const testEnv = new WizardTestEnv('flutter', ['build', 'web'], {
    cwd: projectDir,
    debug: debug,
  });

  await expect(
    testEnv.waitForOutput(expectedOutput, {
      timeout: 120_000,
    }),
  ).resolves.toBe(true);
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
  const testEnv = new WizardTestEnv('npm', ['run', 'dev'], { cwd: projectDir });

  await expect(
    testEnv.waitForOutput(expectedOutput, {
      timeout: 120_000,
    }),
  ).resolves.toBe(true);
  testEnv.kill();
}

/**
 * Check if the project runs on prod mode
 * @param projectDir
 * @param expectedOutput
 */
export async function checkIfRunsOnProdMode(
  projectDir: string,
  expectedOutput: string,
  startCommand = 'start',
) {
  const testEnv = new WizardTestEnv('npm', ['run', startCommand], {
    cwd: projectDir,
  });

  await expect(
    testEnv.waitForOutput(expectedOutput, {
      timeout: 120_000,
    }),
  ).resolves.toBe(true);
  testEnv.kill();
}
