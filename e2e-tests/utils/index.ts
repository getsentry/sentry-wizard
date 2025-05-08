import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Integration } from '../../lib/Constants';
import { spawn, execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { dim, green, red } from '../../lib/Helper/Logging';
import { expect } from 'vitest';

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
  error: (message: unknown) => {
    function formatMessage(message: unknown, depth: number): string {
      if (depth > 3) {
        return '...';
      }

      if (message instanceof Error) {
        return JSON.stringify(
          {
            name: message.name,
            message: message.message,
            stack: message.stack,
            ...(message.cause
              ? {
                  cause: formatMessage(message.cause, depth + 1),
                }
              : {}),
          },
          null,
          2,
        );
      }
      return String(message);
    }
    red(`[ERROR] ${formatMessage(message, 0)}`);
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
      this.taskHandle.stdout?.pipe(process.stdout);
      this.taskHandle.stderr?.pipe(process.stderr);
    }
  }

  sendStdin(input: string) {
    this.taskHandle.stdin?.write(input);
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
        this.kill();
        reject(
          new Error(`Timeout waiting for status code: ${statusCode ?? 'null'}`),
        );
      }, timeout);

      this.taskHandle.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        reject(err);
      });

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
        this.taskHandle.off('error', errorListener);
        this.taskHandle.stdout?.off('data', dataListener);

        this.kill();
        if (optional) {
          // The output is not found but it's optional so we can resolve the promise with false
          resolve(false);
        } else {
          reject(
            new Error(
              `Timeout waiting for output: ${output}. Got the following instead: ${outputBuffer}`,
            ),
          );
        }
      }, timeout);

      const dataListener = (data: string) => {
        outputBuffer += data;
        if (outputBuffer.includes(output)) {
          clearTimeout(timeoutId);
          this.taskHandle.off('error', errorListener);
          this.taskHandle.stdout?.off('data', dataListener);
          // The output is found so we can resolve the promise with true
          resolve(true);
        }
      };

      const errorListener = (err: Error) => {
        this.taskHandle.off('error', errorListener);
        this.taskHandle.stdout?.off('data', dataListener);
        clearTimeout(timeoutId);
        reject(err);
      };

      this.taskHandle.on('error', errorListener);
      this.taskHandle.stdout?.on('data', dataListener);
    });
  }

  kill() {
    this.taskHandle.stdin?.destroy();
    this.taskHandle.stderr?.destroy();
    this.taskHandle.stdout?.destroy();
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
    execSync('git restore .', { cwd: projectDir });
    // Revert untracked files
    execSync('git clean -fd .', { cwd: projectDir });
    // Remove node_modules and dist (.gitignore'd and therefore not removed via git clean)
    execSync('rm -rf node_modules', { cwd: projectDir });
    execSync('rm -rf dist', { cwd: projectDir });
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
  const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
    ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
    : ['dist', 'bin.js'];
  const binPath = path.join(__dirname, '..', '..', ...binName);

  revertLocalChanges(projectDir);
  cleanupGit(projectDir);
  initGit(projectDir);

  return new WizardTestEnv(
    binPath,
    [
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
      '--disable-telemetry',
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
 * Read the file contents and check if it does not contain the given content
 *
 * @param {string} filePath
 * @param {(string | string[])} content
 */
export function checkFileDoesNotContain(
  filePath: string,
  content: string | string[],
) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const contentArray = Array.isArray(content) ? content : [content];

  for (const c of contentArray) {
    expect(fileContent).not.toContain(c);
  }
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

  const builtSuccessfully = await testEnv.waitForStatusCode(0, {
    timeout: 120_000,
  });

  expect(builtSuccessfully).toBe(true);
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

  const outputReceived = await testEnv.waitForOutput(expectedOutput, {
    timeout: 120_000,
  });

  expect(outputReceived).toBe(true);
}

/**
 * Check if the React Native project bundles successfully for the specified platform.
 * Returns a boolean indicating if the process exits with status code 0.
 * @param projectDir The root directory of the React Native project.
 * @param platform The platform to bundle for ('ios' or 'android').
 * @param debug runs the command in debug mode if true
 */
export async function checkIfReactNativeBundles(
  projectDir: string,
  platform: 'ios' | 'android',
  debug = false,
): Promise<boolean> {
  const entryFile = 'index.js';
  const dev = 'false'; // Test a production-like bundle
  let bundleOutput: string;
  let assetsDest: string;

  if (platform === 'ios') {
    bundleOutput = './ios/main.jsbundle';
    assetsDest = './ios';
  } else {
    // android
    bundleOutput = './android/app/src/main/assets/index.android.bundle';
    assetsDest = './android/app/src/main/res';
  }

  const bundleCommandArgs = [
    'react-native',
    'bundle',
    '--entry-file',
    entryFile,
    '--platform',
    platform,
    '--dev',
    dev,
    '--bundle-output',
    bundleOutput,
    '--assets-dest',
    assetsDest,
  ];

  const testEnv = new WizardTestEnv('npx', bundleCommandArgs, {
    cwd: projectDir,
    debug: debug,
  });

  const builtSuccessfully = await testEnv.waitForStatusCode(0, {
    timeout: 300_000,
  });

  testEnv.kill();

  return builtSuccessfully;
}

/**
 * Check if the Expo project exports successfully for the specified platform.
 * Returns a boolean indicating if the process exits with status code 0.
 * @param projectDir The root directory of the Expo project.
 * @param platform The platform to export for ('ios', 'android', or 'web').
 * @param debug runs the command in debug mode if true
 */
export async function checkIfExpoBundles(
  projectDir: string,
  platform: 'ios' | 'android' | 'web',
  debug = false,
): Promise<boolean> {
  const exportCommandArgs = [
    'expo',
    'export',
    '--platform',
    platform,
  ];

  const testEnv = new WizardTestEnv('npx', exportCommandArgs, {
    cwd: projectDir,
    debug: debug,
  });

  const builtSuccessfully = await testEnv.waitForStatusCode(0, {
    timeout: 300_000,
  });

  testEnv.kill();
  return builtSuccessfully;
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

  expect(
    await testEnv.waitForOutput(expectedOutput, {
      timeout: 120_000,
    }),
  ).toBe(true);

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

  expect(
    await testEnv.waitForOutput(expectedOutput, {
      timeout: 120_000,
    }),
  ).toBe(true);

  testEnv.kill();
}
