import * as childProcess from 'child_process';
import * as os from 'os';

/**
 * Checks if the current working directory is a git repository.
 *
 * @param opts.cwd The directory of the project. If undefined, the current process working directory will be used.
 *
 * @returns true if the current working directory is a git repository, false otherwise.
 */
export function isInGitRepo(opts?: { cwd: string | undefined }) {
  const cwd = opts?.cwd;
  try {
    childProcess.execSync('git rev-parse --is-inside-work-tree', {
      stdio: 'ignore',
      cwd,
    });
    return true;
  } catch {
    return false;
  }
}

export function getUncommittedOrUntrackedFiles(): string[] {
  try {
    const gitStatus = childProcess
      .execSync('git status --porcelain=v1', {
        // we only care about stdout
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString();

    const files = gitStatus
      .split(os.EOL)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((f) => `- ${f.split(/\s+/)[1]}`);

    return files;
  } catch {
    return [];
  }
}
