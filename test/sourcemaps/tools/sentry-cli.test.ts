import * as fs from 'fs';

import { addSentryCommandToBuildCommand } from '../../../src/sourcemaps/tools/sentry-cli';

import * as packageManagerHelpers from '../../../src/utils/package-manager';
import { getPackageDotJson } from '../../../src/utils/clack';

import { vi, it, describe, expect, afterEach } from 'vitest';

const writeFileSpy = vi
  .spyOn(fs.promises, 'writeFile')
  .mockImplementation(() => Promise.resolve());

vi.mock('@clack/prompts', () => {
  return {
    log: {
      info: vi.fn(),
      success: vi.fn(),
    },
    confirm: vi.fn().mockResolvedValue(true),
    isCancel: vi.fn().mockReturnValue(false),
  };
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
vi.mock('../../../src/utils/clack', async () => ({
  ...(await vi.importActual('../../../src/utils/clack')),
  getPackageDotJson: vi.fn().mockResolvedValue({
    scripts: {
      build: 'tsc',
    },
    version: '1.0.0',
  }),
}));

describe('addSentryCommandToBuildCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it.each([
    [
      packageManagerHelpers.NPM,
      packageManagerHelpers.PNPM,
      packageManagerHelpers.YARN_V1,
      packageManagerHelpers.YARN_V2,
      packageManagerHelpers.BUN,
      packageManagerHelpers.DENO,
    ],
  ])('adds the cli command to the script command (%s)', async (_, pacMan) => {
    vi.spyOn(packageManagerHelpers, '_detectPackageManger').mockReturnValue(
      pacMan,
    );
    await addSentryCommandToBuildCommand();
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining(
        `tsc && ${pacMan.runScriptCommand} sentry:sourcemaps`,
      ),
    );
  });

  it('does not add the cli command to the script command if it is already in there', async () => {
    vi.mocked(getPackageDotJson).mockResolvedValue({
      scripts: {
        build: 'tsc && sentry:sourcemaps',
      },
      version: '1.0.0',
    });

    await addSentryCommandToBuildCommand();

    expect(writeFileSpy).not.toHaveBeenCalled();
  });
});
