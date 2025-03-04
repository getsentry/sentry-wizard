import {
  abort,
  askForToolConfigPath,
  askForWizardLogin,
  createNewConfigFile,
  installPackage,
} from '../../src/utils/clack-utils';

import * as fs from 'node:fs';
import * as ChildProcess from 'node:child_process';
import type { PackageManager } from '../../src/utils/package-manager';

import axios from 'axios';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

import * as Sentry from '@sentry/node';

jest.mock('node:child_process', () => ({
  __esModule: true,
  ...jest.requireActual('node:child_process'),
}));

jest.mock('@clack/prompts', () => ({
  log: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  outro: jest.fn(),
  text: jest.fn(),
  confirm: jest.fn(),
  cancel: jest.fn(),
  // passthrough for abortIfCancelled
  isCancel: jest.fn().mockReturnValue(false),
  spinner: jest
    .fn()
    .mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
}));
const clackMock = clack as jest.Mocked<typeof clack>;

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('opn', () => jest.fn(() => Promise.resolve({ on: jest.fn() })));

function mockUserResponse(fn: jest.Mock, response: any) {
  fn.mockReturnValueOnce(response);
}

describe('askForToolConfigPath', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined if users have no config file', async () => {
    mockUserResponse(clack.confirm as jest.Mock, false);

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(result).toBeUndefined();
  });

  it('returns the path if users have a config file and the entered path is valid', async () => {
    mockUserResponse(clack.confirm as jest.Mock, true);
    mockUserResponse(clack.text as jest.Mock, 'my.webpack.config.js');

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(clack.text).toHaveBeenCalledWith(
      expect.objectContaining({
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
    jest.clearAllMocks();
  });

  it('writes the file to disk and returns true if the file was created successfully', async () => {
    const writeFileSpy = jest
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(jest.fn());

    const filename = '/webpack.config.js';
    const code = 'module.exports = {/*config...*/}';

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
  });

  it('logs more information if provided as an argument', async () => {
    jest.spyOn(fs.promises, 'writeFile').mockImplementation(jest.fn());

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
    const writeFileSpy = jest
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
    jest.clearAllMocks();
  });

  it('force-installs a package if the forceInstall flag is set', async () => {
    const packageManagerMock: PackageManager = {
      name: 'npm',
      label: 'NPM',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
      runScriptCommand: 'npm run',
      flags: '',
      forceInstallFlag: '--force',
      detect: jest.fn(),
      addOverride: jest.fn(),
    };

    const execSpy = jest
      .spyOn(ChildProcess, 'exec')
      // @ts-expect-error - don't care about the return value
      .mockImplementationOnce((cmd, cb) => {
        if (cb) {
          // @ts-expect-error - don't care about the options value
          cb(null, '', '');
        }
      });

    await installPackage({
      alreadyInstalled: false,
      packageName: '@sentry/sveltekit',
      packageNameDisplayLabel: '@sentry/sveltekit',
      forceInstall: true,
      askBeforeUpdating: false,
      packageManager: packageManagerMock,
    });

    expect(execSpy).toHaveBeenCalledWith(
      'npm install @sentry/sveltekit  --force',
      expect.any(Function),
    );
  });

  it.each([false, undefined])(
    "doesn't force-install a package if the forceInstall flag is %s",
    async (flag) => {
      const packageManagerMock: PackageManager = {
        name: 'npm',
        label: 'NPM',
        installCommand: 'npm install',
        buildCommand: 'npm run build',
        runScriptCommand: 'npm run',
        flags: '',
        forceInstallFlag: '--force',
        detect: jest.fn(),
        addOverride: jest.fn(),
      };

      const execSpy = jest
        .spyOn(ChildProcess, 'exec')
        // @ts-expect-error - don't care about the return value
        .mockImplementationOnce((cmd, cb) => {
          if (cb) {
            // @ts-expect-error - don't care about the options value
            cb(null, '', '');
          }
        });

      await installPackage({
        alreadyInstalled: false,
        packageName: '@sentry/sveltekit',
        packageNameDisplayLabel: '@sentry/sveltekit',
        forceInstall: flag,
        askBeforeUpdating: false,
        packageManager: packageManagerMock,
      });

      expect(execSpy).toHaveBeenCalledWith(
        'npm install @sentry/sveltekit  ',
        expect.any(Function),
      );
    },
  );
});

describe('askForWizardLogin', () => {
  // mock axios
  afterEach(() => {
    // clackMock.confirm.mockClear();
    // mockUserResponse(clack.confirm as jest.Mock, undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockClear();
    clackMock.confirm.mockClear();
    clackMock.confirm.mockReset();
    mockUserResponse(clack.confirm as jest.Mock, undefined);
  });

  it('asks if a user already has a Sentry account by default', async () => {
    mockUserResponse(clack.confirm as jest.Mock, Promise.resolve(true));

    // Provide the data object to be returned
    mockedAxios.get.mockResolvedValue({
      data: {
        hash: 'mockedHash',
      },
    });

    await askForWizardLogin({ url: 'https://santry.io/' });

    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('already have a Sentry account'),
      }),
    );
  });

  it('skips asking for if a user already has a Sentry account if org and project are pre-selected', async () => {
    mockUserResponse(clackMock.confirm as jest.Mock, Promise.resolve(true));

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
  const sentryTxn = {
    setStatus: jest.fn(),
    finish: jest.fn(),
  };

  let sentrySession = {
    status: 999,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sentrySession = {
      status: 999,
    };
  });

  jest.spyOn(Sentry, 'getCurrentHub').mockReturnValue({
    getScope: () => ({
      // @ts-expect-error - don't care about the rest of the required props value
      getTransaction: () => sentryTxn,
      // @ts-expect-error - don't care about the rest of the required props value
      getSession: () => sentrySession,
    }),
    captureSession: jest.fn(),
  });

  const flushSpy = jest.fn();
  jest.spyOn(Sentry, 'flush').mockImplementation(flushSpy);

  it('ends the process with an error exit code by default', async () => {
    // @ts-ignore - jest doesn't like the empty function
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await abort();

    expect(exitSpy).toHaveBeenCalledWith(1);

    expect(clackMock.outro).toHaveBeenCalledTimes(1);
    expect(clackMock.outro).toHaveBeenCalledWith('Wizard setup cancelled.');

    expect(sentryTxn.setStatus).toHaveBeenLastCalledWith('aborted');
    expect(sentryTxn.finish).toHaveBeenCalledTimes(1);
    expect(sentrySession.status).toBe('crashed');
    expect(flushSpy).toHaveBeenLastCalledWith(3000);
  });

  it('ends the process with a custom exit code and message if provided', async () => {
    // @ts-ignore - jest doesn't like the empty function
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await abort('Bye', 0);

    expect(exitSpy).toHaveBeenCalledWith(0);

    expect(clackMock.outro).toHaveBeenCalledTimes(1);
    expect(clackMock.outro).toHaveBeenCalledWith('Bye');

    expect(sentryTxn.setStatus).toHaveBeenLastCalledWith('cancelled');
    expect(sentryTxn.finish).toHaveBeenCalledTimes(1);
    expect(sentrySession.status).toBe('abnormal');
    expect(flushSpy).toHaveBeenLastCalledWith(3000);
  });
});
