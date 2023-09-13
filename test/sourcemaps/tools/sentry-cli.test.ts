import * as fs from 'fs';

import { addSentryCommandToBuildCommand } from '../../../src/sourcemaps/tools/sentry-cli';

import * as packageManagerHelpers from '../../../src/utils/package-manager';

const writeFileSpy = jest
  .spyOn(fs.promises, 'writeFile')
  .mockImplementation(() => Promise.resolve());

jest.mock('@clack/prompts', () => {
  return {
    log: {
      info: jest.fn(),
      success: jest.fn(),
    },
    confirm: jest.fn().mockResolvedValue(true),
    isCancel: jest.fn().mockReturnValue(false),
  };
});

describe('addSentryCommandToBuildCommand', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it.each([
    [
      packageManagerHelpers.NPM,
      packageManagerHelpers.PNPM,
      packageManagerHelpers.YARN,
      packageManagerHelpers.BUN,
    ],
  ])('adds the cli command to the script command (%s)', async (_, pacMan) => {
    jest
      .spyOn(packageManagerHelpers, 'detectPackageManger')
      .mockReturnValue(pacMan);
    const packageJson = {
      scripts: {
        build: 'tsc',
      },
      version: '1.0.0',
    };
    await addSentryCommandToBuildCommand(packageJson);
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining(
        `tsc && ${pacMan.runScriptCommand} sentry:sourcemaps`,
      ),
    );
  });
});
