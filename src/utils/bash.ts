import * as child_process from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type SentryCli = {
  /** The binary name to show in instructions. */
  binary: 'sentry' | 'sentry-cli';
  /** The command that runs it, an absolute path when it is not on PATH. */
  command: string;
};

/**
 * Returns true when the command runs and exits with code 0 within 10 seconds.
 * Arguments are not passed through a shell.
 */
export function commandSucceeds(command: string, args: string[]): boolean {
  try {
    child_process.execFileSync(command, args, {
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds an installed Sentry CLI. Prefers v4 `sentry` and falls back to the
 * legacy `sentry-cli`.
 *
 * `sentry debug-files --help` exits non-zero for unrelated `sentry` binaries,
 * such as the self-hosted Sentry server's. The v4 installer puts `sentry` in
 * `~/.local/bin` when `/usr/local/bin` is not writable, and a fresh install
 * there is not on PATH until the shell restarts.
 */
export function detectSentryCli(): SentryCli | undefined {
  const sentryCommand = [
    'sentry',
    path.join(os.homedir(), '.local', 'bin', 'sentry'),
  ].find((command) => commandSucceeds(command, ['debug-files', '--help']));
  if (sentryCommand) {
    return { binary: 'sentry', command: sentryCommand };
  }
  if (commandSucceeds('sentry-cli', ['--version'])) {
    return { binary: 'sentry-cli', command: 'sentry-cli' };
  }
  return undefined;
}

export async function installSentryCLI(): Promise<void> {
  const httpAsync = new Promise((resolve, reject) => {
    const file = fs.createWriteStream('installcli.sh');
    https.get('https://sentry.io/get-cli/', (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        try {
          child_process.execSync('bash ./installcli.sh');
        } catch (e) {
          reject(e);
          return;
        }
        fs.unlinkSync('installcli.sh');
        resolve(null);
      });

      file.on('error', (err) => {
        fs.unlinkSync('installcli.sh');
        reject(err);
      });
    });
  });

  await httpAsync;
}

export function execute(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    child_process.exec(command, (error, stdout, _) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}
