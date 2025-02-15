import {
  askForToolConfigPath,
  createNewConfigFile,
  installPackage,
} from '../../src/utils/clack-utils';

import * as fs from 'fs';
import * as ChildProcess from 'child_process';
import { PackageManager } from '../../src/utils/package-manager';

type ClackMock = {
  confirm: jest.Mock;
  text: jest.Mock;
  isCancel: jest.Mock;
  cancel: jest.Mock;
  log: {
    info: jest.Mock;
    success: jest.Mock;
    warn: jest.Mock;
  };
  spinner: () => { start: jest.Mock; stop: jest.Mock };
};

let clackMock: ClackMock;

jest.mock('@clack/prompts', () => {
  clackMock = {
    log: {
      info: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
    },
    text: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
    // passthrough for abortIfCancelled
    isCancel: jest.fn().mockReturnValue(false),
    spinner: jest
      .fn()
      .mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
  };
  return clackMock;
});

function mockUserResponse(fn: jest.Mock, response: any) {
  fn.mockReturnValueOnce(response);
}

describe('askForToolConfigPath', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined if users have no config file', async () => {
    mockUserResponse(clackMock.confirm, false);

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clackMock.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(result).toBeUndefined();
  });

  it('returns the path if users have a config file and the entered path is valid', async () => {
    mockUserResponse(clackMock.confirm, true);
    mockUserResponse(clackMock.text, 'my.webpack.config.js');

    const result = await askForToolConfigPath('Webpack', 'webpack.config.js');

    expect(clackMock.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('have a Webpack config file'),
      }),
    );

    expect(clackMock.text).toHaveBeenCalledWith(
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

    const filename = '/weboack.config.js';
    const code = `module.exports = {/*config...*/}`;

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
  });

  it('logs more information if provided as an argument', async () => {
    jest.spyOn(fs.promises, 'writeFile').mockImplementation(jest.fn());

    const filename = '/weboack.config.js';
    const code = `module.exports = {/*config...*/}`;
    const moreInfo = 'More information...';

    await createNewConfigFile(filename, code, moreInfo);

    expect(clackMock.log.info).toHaveBeenCalledTimes(1);
    expect(clackMock.log.info).toHaveBeenCalledWith(
      expect.stringContaining(moreInfo),
    );
  });

  it('returns false and logs a warning if the file could not be created', async () => {
    const writeFileSpy = jest
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(() => Promise.reject(new Error('Could not write')));

    const filename = '/webpack.config.js';
    const code = `module.exports = {/*config...*/}`;

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(false);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
    expect(clackMock.log.warn).toHaveBeenCalledTimes(1);
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
