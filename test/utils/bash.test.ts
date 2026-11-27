import * as child_process from 'child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { commandSucceeds, detectSentryCli } from '../../src/utils/bash';

const localSentry = path.join(os.homedir(), '.local', 'bin', 'sentry');

/**
 * Makes execFileSync succeed only for the given `command args` strings,
 * as if those binaries were installed.
 */
function installed(...invocations: string[]) {
  vi.mocked(child_process.execFileSync).mockImplementation((command, args) => {
    const invocation = [command, ...(args ?? [])].join(' ');
    if (!invocations.includes(invocation)) {
      throw new Error(`Command failed: ${invocation}`);
    }
    return Buffer.from('');
  });
}

const sentryOnPath = 'sentry debug-files --help';
const sentryInLocalBin = `${localSentry} debug-files --help`;
const sentryCli = 'sentry-cli --version';

describe('detectSentryCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects v4 sentry on PATH', () => {
    installed(sentryOnPath);

    expect(detectSentryCli()).toEqual({ binary: 'sentry', command: 'sentry' });
  });

  it('detects v4 sentry in ~/.local/bin when it is not on PATH yet', () => {
    installed(sentryInLocalBin);

    expect(detectSentryCli()).toEqual({
      binary: 'sentry',
      command: localSentry,
    });
  });

  it('detects sentry-cli when it is the only CLI', () => {
    installed(sentryCli);

    expect(detectSentryCli()).toEqual({
      binary: 'sentry-cli',
      command: 'sentry-cli',
    });
  });

  it('prefers sentry when both CLIs are installed', () => {
    installed(sentryOnPath, sentryCli);

    expect(detectSentryCli()).toEqual({ binary: 'sentry', command: 'sentry' });
  });

  it('returns undefined when no CLI is installed', () => {
    installed();

    expect(detectSentryCli()).toBeUndefined();
  });

  it('skips an unrelated sentry binary and falls back to sentry-cli', () => {
    // An unrelated `sentry`, such as the self-hosted server's, runs
    // `--version` but has no `debug-files` command.
    installed('sentry --version', sentryCli);

    expect(detectSentryCli()).toEqual({
      binary: 'sentry-cli',
      command: 'sentry-cli',
    });
  });

  it('returns undefined when only an unrelated sentry binary is installed', () => {
    installed('sentry --version');

    expect(detectSentryCli()).toBeUndefined();
  });
});

describe('commandSucceeds', () => {
  it('runs the command without a shell and ignores its output', () => {
    installed('sentry snapshots upload --help');

    expect(commandSucceeds('sentry', ['snapshots', 'upload', '--help'])).toBe(
      true,
    );
    expect(child_process.execFileSync).toHaveBeenCalledWith(
      'sentry',
      ['snapshots', 'upload', '--help'],
      expect.objectContaining({ stdio: 'ignore' }),
    );
  });

  it('returns false when the command fails', () => {
    installed();

    expect(commandSucceeds('sentry', ['snapshots', 'upload', '--help'])).toBe(
      false,
    );
  });
});
