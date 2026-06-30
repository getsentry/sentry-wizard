import {
  abort,
  askForToolConfigPath,
  askForWizardLogin,
  confirmContinueIfNoOrDirtyGitRepo,
  createNewConfigFile,
  getPackageManager,
  installPackage,
} from '../../../src/utils/clack/';

import * as fs from 'node:fs';
import * as ChildProcess from 'node:child_process';
import type { PackageManager } from '../../../src/utils/package-manager';
import * as PackageManagerUtils from '../../../src/utils/package-manager';
import * as GitUtils from '../../../src/utils/git';

import {
  NPM,
  PNPM,
  YARN_V1,
  YARN_V2,
} from '../../../src/utils/package-manager';

import axios from 'axios';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

import * as Sentry from '@sentry/node';

import {
  vi,
  it,
  describe,
  expect,
  beforeEach,
  Mocked,
  Mock,
  afterEach,
} from 'vitest';

vi.mock('node:child_process', async () => ({
  __esModule: true,
  ...(await vi.importActual<typeof ChildProcess>('node:child_process')),
}));

vi.mock('@clack/prompts', () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  outro: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  // passthrough for abortIfCancelled
  isCancel: vi.fn().mockReturnValue(false),
  spinner: vi
    .fn()
    .mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
}));
const clackMock = clack as Mocked<typeof clack>;

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

vi.mock('../../../src/utils/git', () => ({
  isInGitRepo: vi.fn(),
  getUncommittedOrUntrackedFiles: vi.fn(),
}));

vi.mock('opn', () => ({
  default: vi.fn(() => Promise.resolve({ on: vi.fn() })),
}));

// Sentry mock functions defined at module level for the abort tests
const mockRootSpan = {
  setStatus: vi.fn(),
  end: vi.fn(),
};
const mockActiveSpan = {};
let mockSentrySession = { status: 999 as number | string };

vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual<typeof import('@sentry/node')>(
    '@sentry/node',
  );
  return {
    ...actual,
    getActiveSpan: vi.fn(() => mockActiveSpan),
    getRootSpan: vi.fn(() => mockRootSpan),
    getCurrentScope: vi.fn(() => ({
      getSession: () => mockSentrySession,
    })),
    captureSession: vi.fn(),
    flush: vi.fn(() => Promise.resolve(true)),
    setTag: vi.fn(),
    captureException: vi.fn(() => 'id'),
  };
});

function mockUserResponse(fn: Mock, response: unknown) {
  fn.mockReturnValueOnce(response);
}

describe('askForToolConfigPath', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined if users have no config file', async () => {
    mockUserResponse(clack.confirm as Mock, false);

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(result).toBeUndefined();
  });

  it('returns the path if users have a config file and the entered path is valid', async () => {
    mockUserResponse(clack.confirm as Mock, true);
    mockUserResponse(clack.text as Mock, 'my.webpack.config.js');

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(clack.text).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining(
          'enter the path to your Webpack config file',
        ),
      }),
    );

    expect(result).toBe('my.webpack.config.js');
  });
});

describe('createNewConfigFile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes the file to disk and returns true if the file was created successfully', async () => {
    const writeFileSpy = vi
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(vi.fn());

    const filename = '/webpack.config.js';
    const code = 'module.exports = {/*config...*/}';

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
  });

  it('logs more information if provided as an argument', async () => {
    vi.spyOn(fs.promises, 'writeFile').mockImplementation(vi.fn());

    const filename = '/webpack.config.js';
    const code = 'module.exports = {/*config...*/}';
    const moreInfo = 'More information...';

    await createNewConfigFile(filename, code, moreInfo);

    expect(clack.log.info).toHaveBeenCalledTimes(1);
    expect(clack.log.info).toHaveBeenCalledWith(
      expect.stringContaining(moreInfo),
    );
  });

  it('returns false and logs a warning if the file could not be created', async () => {
    const writeFileSpy = vi
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(() => Promise.reject(new Error('Could not write')));

    const filename = '/webpack.config.js';
    const code = 'module.exports = {/*config...*/}';

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(false);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
    expect(clack.log.warn).toHaveBeenCalledTimes(1);
  });

  it('returns false if the passed path is not absolute', async () => {
    const result = await createNewConfigFile(
      './relative/webpack.config.js',
      '',
    );

    expect(result).toBe(false);
  });
});

describe('installPackage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const spawnSpy = vi.spyOn(ChildProcess, 'spawn').mockImplementation(() => ({
    // @ts-expect-error - not passing the full object but directly resolving
    // to simulate a successful install
    on: vi.fn((evt: 'close', cb: (args) => void) => {
      if (evt === 'close') {
        cb(0);
      }
    }),
    // @ts-expect-error - this is fine
    stderr: { on: vi.fn() },
  }));

  it('force-installs a package if the forceInstall flag is set', async () => {
    const packageManagerMock: PackageManager = {
      name: 'npm',
      label: 'NPM',
      installCommand: 'install',
      buildCommand: 'npm run build',
      runScriptCommand: 'npm run',
      flags: '',
      forceInstallFlag: '--force',
      detect: vi.fn(),
      addOverride: vi.fn(),
    };

    await installPackage({
      alreadyInstalled: false,
      packageName: '@some/package',
      packageNameDisplayLabel: '@some/package',
      forceInstall: true,
      askBeforeUpdating: false,
      packageManager: packageManagerMock,
    });

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['install', '@some/package', '--force'],
      { shell: true, stdio: ['pipe', 'ignore', 'pipe'] },
    );
  });

  it.each([false, undefined])(
    "doesn't force-install a package if the forceInstall flag is %s",
    async (flag) => {
      const packageManagerMock: PackageManager = {
        name: 'npm',
        label: 'NPM',
        installCommand: 'install',
        buildCommand: 'npm run build',
        runScriptCommand: 'npm run',
        flags: '',
        forceInstallFlag: '--force',
        detect: vi.fn(),
        addOverride: vi.fn(),
      };

      await installPackage({
        alreadyInstalled: false,
        packageName: '@sentry/sveltekit',
        packageNameDisplayLabel: '@sentry/sveltekit',
        forceInstall: flag,
        askBeforeUpdating: false,
        packageManager: packageManagerMock,
      });

      expect(spawnSpy).toHaveBeenCalledWith(
        'npm',
        ['install', '@sentry/sveltekit'],
        { shell: true, stdio: ['pipe', 'ignore', 'pipe'] },
      );
    },
  );

  it('adds install flags if defined', async () => {
    const packageManagerMock: PackageManager = {
      name: 'npm',
      label: 'NPM',
      installCommand: 'install',
      buildCommand: 'npm run build',
      runScriptCommand: 'npm run',
      flags: '--ignore-workspace-root-check',
      forceInstallFlag: '--force',
      detect: vi.fn(),
      addOverride: vi.fn(),
    };

    await installPackage({
      alreadyInstalled: false,
      packageName: '@some/package',
      packageNameDisplayLabel: '@some/package',
      forceInstall: true,
      askBeforeUpdating: false,
      packageManager: packageManagerMock,
    });

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',

      ['install', '@some/package', '--ignore-workspace-root-check', '--force'],
      { shell: true, stdio: ['pipe', 'ignore', 'pipe'] },
    );
  });
});

describe('askForWizardLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockClear();
    clackMock.confirm.mockClear();
    clackMock.confirm.mockReset();
    mockUserResponse(clack.confirm as Mock, undefined);
  });

  it('asks if a user already has a Sentry account by default', async () => {
    mockUserResponse(clack.confirm as Mock, Promise.resolve(true));

    // Provide the data object to be returned
    mockedAxios.get.mockResolvedValue({
      data: {
        hash: 'mockedHash',
      },
    });

    await askForWizardLogin({ url: 'https://santry.io/' });

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining('already have a Sentry account'),
      }),
    );
  });

  it('skips asking for if a user already has a Sentry account if org and project are pre-selected', async () => {
    mockUserResponse(clackMock.confirm as Mock, Promise.resolve(true));

    // Provide the data object to be returned
    mockedAxios.get.mockResolvedValue({
      data: {
        hash: 'mockedHash',
      },
    });

    await askForWizardLogin({
      url: 'https://santry.io/',
      orgSlug: 'my-org',
      projectSlug: 'my-project',
    });

    expect(clack.confirm).not.toHaveBeenCalled();
  });
});

describe('abort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSentrySession = { status: 999 };
  });

  it('ends the process with an error exit code by default', async () => {
    // @ts-expect-error - vitest doesn't like the empty function
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await abort();

    expect(exitSpy).toHaveBeenCalledWith(1);

    expect(clackMock.outro).toHaveBeenCalledTimes(1);
    expect(clackMock.outro).toHaveBeenCalledWith('Wizard setup cancelled.');

    expect(mockRootSpan.setStatus).toHaveBeenLastCalledWith({
      code: 2,
      message: 'aborted',
    });
    expect(mockRootSpan.end).toHaveBeenCalledTimes(1);
    expect(mockSentrySession.status).toBe('crashed');
    expect(Sentry.flush).toHaveBeenLastCalledWith(3000);
  });

  it('ends the process with a custom exit code and message if provided', async () => {
    // @ts-expect-error - vitest doesn't like the empty function
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await abort('Bye', 0);

    expect(exitSpy).toHaveBeenCalledWith(0);

    expect(clackMock.outro).toHaveBeenCalledTimes(1);
    expect(clackMock.outro).toHaveBeenCalledWith('Bye');

    expect(mockRootSpan.setStatus).toHaveBeenLastCalledWith({
      code: 1,
      message: 'cancelled',
    });
    expect(mockRootSpan.end).toHaveBeenCalledTimes(1);
    expect(mockSentrySession.status).toBe('abnormal');
    expect(Sentry.flush).toHaveBeenLastCalledWith(3000);
  });
});

describe('getPackageManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - this variable is set by the wizard
    delete global.__sentry_wizard_cached_package_manager;
  });

  it('returns the auto-detected package manager', async () => {
    const detectPacManSpy = vi
      .spyOn(PackageManagerUtils, '_detectPackageManger')
      .mockReturnValueOnce(YARN_V1);

    const packageManager = await getPackageManager();

    expect(detectPacManSpy).toHaveBeenCalledTimes(1);

    expect(packageManager).toBe(YARN_V1);
  });

  it('caches the auto-detected package manager', async () => {
    const detectPacManSpy = vi
      .spyOn(PackageManagerUtils, '_detectPackageManger')
      .mockReturnValueOnce(YARN_V1);

    const packageManager1 = await getPackageManager();
    const packageManager2 = await getPackageManager();

    expect(detectPacManSpy).toHaveBeenCalledTimes(1);

    expect(packageManager1).toBe(YARN_V1);
    expect(packageManager2).toBe(YARN_V1);
  });

  describe('when auto detection fails', () => {
    it('returns a fallback package manager if fallback is specified', async () => {
      const detectPacManSpy = vi
        .spyOn(PackageManagerUtils, '_detectPackageManger')
        .mockReturnValueOnce(null);

      const packageManager = await getPackageManager(YARN_V2);

      expect(detectPacManSpy).toHaveBeenCalledTimes(1);

      expect(packageManager).toBe(YARN_V2);
    });

    it("doesn't cache the fallback package manager", async () => {
      const detectPacManSpy = vi
        .spyOn(PackageManagerUtils, '_detectPackageManger')
        .mockReturnValue(null);

      const packageManager1 = await getPackageManager(YARN_V2);
      const packageManager2 = await getPackageManager(NPM);

      expect(detectPacManSpy).toHaveBeenCalledTimes(2);

      expect(packageManager1).toBe(YARN_V2);
      expect(packageManager2).toBe(NPM);
    });

    it('returns the user-selected package manager if no fallback is provided', async () => {
      const detectPacManSpy = vi
        .spyOn(PackageManagerUtils, '_detectPackageManger')
        .mockReturnValueOnce(null);

      clackMock.select.mockReturnValueOnce(Promise.resolve(PNPM));

      const packageManager = await getPackageManager();

      expect(detectPacManSpy).toHaveBeenCalledTimes(1);
      expect(packageManager).toBe(PNPM);
    });

    it('caches the user-selected package manager', async () => {
      const detectPacManSpy = vi
        .spyOn(PackageManagerUtils, '_detectPackageManger')
        .mockReturnValueOnce(null);

      clackMock.select.mockReturnValueOnce(Promise.resolve(PNPM));

      const packageManager1 = await getPackageManager();
      const packageManager2 = await getPackageManager();

      expect(detectPacManSpy).toHaveBeenCalledTimes(1);
      expect(clackMock.select).toHaveBeenCalledTimes(1);

      expect(packageManager1).toBe(PNPM);
      expect(packageManager2).toBe(PNPM);
    });
  });
});

describe('confirmContinueIfNoOrDirtyGitRepo', () => {
  // process.exit is mocked to throw so that abort() halts execution the same
  // way it would terminate the process in production, instead of falling
  // through to the interactive prompt.
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Drain any leftover `mockReturnValueOnce` values queued by earlier
    // suites; `clearAllMocks` clears call history but not the once-queue.
    clackMock.confirm.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as typeof process.exit);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  describe('non-interactive mode', () => {
    it('aborts without prompting when the project is not a git repository', async () => {
      (GitUtils.isInGitRepo as Mock).mockReturnValue(false);

      await expect(
        confirmContinueIfNoOrDirtyGitRepo({
          ignoreGitChanges: undefined,
          cwd: undefined,
          nonInteractive: true,
        }),
      ).rejects.toThrow('exit');

      expect(clack.log.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'not inside a git repository in non-interactive mode',
        ),
      );
      expect(Sentry.setTag).toHaveBeenCalledWith('continue-without-git', false);
      expect(clack.confirm).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalled();
    });

    it('aborts without prompting when the repository has uncommitted or untracked files', async () => {
      (GitUtils.isInGitRepo as Mock).mockReturnValue(true);
      (GitUtils.getUncommittedOrUntrackedFiles as Mock).mockReturnValue([
        '- src/index.ts',
      ]);

      await expect(
        confirmContinueIfNoOrDirtyGitRepo({
          ignoreGitChanges: false,
          cwd: undefined,
          nonInteractive: true,
        }),
      ).rejects.toThrow('exit');

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('uncommitted or untracked files'),
      );
      expect(clack.log.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'uncommitted or untracked files in non-interactive mode',
        ),
      );
      expect(Sentry.setTag).toHaveBeenCalledWith(
        'continue-with-dirty-repo',
        false,
      );
      expect(clack.confirm).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('interactive mode (default)', () => {
    it('prompts to continue when the project is not a git repository', async () => {
      (GitUtils.isInGitRepo as Mock).mockReturnValue(false);
      mockUserResponse(clack.confirm as Mock, true);

      await confirmContinueIfNoOrDirtyGitRepo({
        ignoreGitChanges: undefined,
        cwd: undefined,
      });

      expect(clack.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message: expect.stringContaining('not inside a git repository'),
        }),
      );
      expect(clack.log.error).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(Sentry.setTag).toHaveBeenCalledWith('continue-without-git', true);
    });

    it('prompts to continue when the repository has uncommitted or untracked files', async () => {
      (GitUtils.isInGitRepo as Mock).mockReturnValue(true);
      (GitUtils.getUncommittedOrUntrackedFiles as Mock).mockReturnValue([
        '- src/index.ts',
      ]);
      mockUserResponse(clack.confirm as Mock, true);

      await confirmContinueIfNoOrDirtyGitRepo({
        ignoreGitChanges: false,
        cwd: undefined,
        nonInteractive: false,
      });

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('uncommitted or untracked files'),
      );
      expect(clack.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message: expect.stringContaining('continue anyway'),
        }),
      );
      expect(clack.log.error).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(Sentry.setTag).toHaveBeenCalledWith(
        'continue-with-dirty-repo',
        true,
      );
    });

    it('does not prompt or abort for a clean git repository', async () => {
      (GitUtils.isInGitRepo as Mock).mockReturnValue(true);
      (GitUtils.getUncommittedOrUntrackedFiles as Mock).mockReturnValue([]);

      await confirmContinueIfNoOrDirtyGitRepo({
        ignoreGitChanges: undefined,
        cwd: undefined,
      });

      expect(clack.confirm).not.toHaveBeenCalled();
      expect(clack.log.warn).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
