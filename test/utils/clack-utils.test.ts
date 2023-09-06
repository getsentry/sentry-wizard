import {
  askForToolConfigPath,
  createNewConfigFile,
} from '../../src/utils/clack-utils';

import * as fs from 'fs';

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

    const filename = 'weboack.config.js';
    const code = `module.exports = {/*config...*/}`;

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
  });

  it('logs more information if provided as an argument', async () => {
    jest.spyOn(fs.promises, 'writeFile').mockImplementation(jest.fn());

    const filename = 'weboack.config.js';
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

    const filename = 'weboack.config.js';
    const code = `module.exports = {/*config...*/}`;

    const result = await createNewConfigFile(filename, code);

    expect(result).toBe(false);
    expect(writeFileSpy).toHaveBeenCalledWith(filename, code);
    expect(clackMock.log.warn).toHaveBeenCalledTimes(1);
  });
});
