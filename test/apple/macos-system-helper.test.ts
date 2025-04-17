import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { MacOSSystemHelpers } from '../../src/apple/macos-system-helper';

import * as childProcess from 'node:child_process';
import path from 'node:path';

const appleProjectsPath = path.resolve(
  __dirname,
  '../../fixtures/test-applications/apple',
);
const projectWithSynchronizedFolders = path.join(
  appleProjectsPath,
  'xcode-15-compatible-project/Project.xcodeproj',
);

// The path to the Xcode.app can be different on different machines, therefore me must detect the path
// to the Xcode.app using the `xcode-select` command.
// The same goes for the SDK path, which can be different on different machines depending if the Command Line Tools
// or the full Xcode is installed.
//
// For additional safety, we also allow the path to be overwritten using the `XCODE_DEVELOPER_DIR_PATH` and `SDK_PATH`
// environment variables, but with the expectation that the paths are correct.
//
// Testing an implementation, i.e. MacOSSystemHelpers.findXcodeAppPath(), by using the same approach in the unit test
// is bad practice, but it's the only way because the path to the Xcode.app can be different on different machines.
//
// While creating these tests we ensured that the implementation in the tests is correct by comparing.
// We must not change the implementation in the test code!

describe('MacOSSystemHelpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('findSDKRootDirectoryPath', () => {
    test.runIf(process.platform === 'darwin')(
      'should return the SDK root directory path',
      () => {
        // -- Arrange --
        let sdkPath: string;
        if (process.env.SDK_PATH) {
          // It is expected that the SDK_PATH environment variable is set in CI.
          sdkPath = process.env.SDK_PATH;
        } else {
          // This is a fallback implementation for local development.
          // It mostly verifies that the implementation of findSDKRootDirectoryPath() is still unchanged,
          // not that the path is correct.
          sdkPath = childProcess
            .execSync('xcrun --show-sdk-path', {
              encoding: 'utf8',
            })
            .trim();
        }

        // -- Act --
        const sdkRootDirectoryPath =
          MacOSSystemHelpers.findSDKRootDirectoryPath();

        // -- Assert --
        expect(sdkRootDirectoryPath).toBe(sdkPath);
      },
    );

    test.runIf(process.platform !== 'darwin')(
      'should return undefined on non-macOS platforms',
      () => {
        // The purpose of this test is to verify that the implementation of findSDKRootDirectoryPath() is still unchanged

        // -- Act --
        const sdkRootDirectoryPath =
          MacOSSystemHelpers.findSDKRootDirectoryPath();

        // -- Assert --
        expect(sdkRootDirectoryPath).toBeUndefined();
      },
    );
  });

  describe('findDeveloperDirectoryPath', () => {
    test.runIf(process.platform === 'darwin')(
      'should return the developer directory path',
      () => {
        // -- Arrange --
        let xcodeAppPath: string;
        if (process.env.XCODE_DEVELOPER_DIR_PATH) {
          // It is expected that the XCODE_DEVELOPER_DIR_PATH environment variable is set in CI.
          xcodeAppPath = process.env.XCODE_DEVELOPER_DIR_PATH;
        } else {
          // This is a fallback implementation for local development.
          // It mostly verifies that the implementation of findDeveloperDirectoryPath() is still unchanged,
          // not that the path is correct.
          xcodeAppPath = childProcess
            .execSync('xcode-select --print-path', {
              encoding: 'utf8',
            })
            .trim();
        }

        // -- Act --
        const developerDirectoryPath =
          MacOSSystemHelpers.findDeveloperDirectoryPath();

        // -- Assert --
        expect(developerDirectoryPath).toBe(xcodeAppPath);
      },
    );

    test.runIf(process.platform !== 'darwin')(
      'should return undefined on non-macOS platforms',
      () => {
        // The purpose of this test is to verify that the implementation of findDeveloperDirectoryPath() is still unchanged

        // -- Act --
        const developerDirectoryPath =
          MacOSSystemHelpers.findDeveloperDirectoryPath();

        // -- Assert --
        expect(developerDirectoryPath).toBeUndefined();
      },
    );
  });

  describe('readXcodeBuildSettings', () => {
    test.runIf(process.platform === 'darwin')(
      'should return the build settings',
      () => {
        // -- Act --
        const buildSettings = MacOSSystemHelpers.readXcodeBuildSettings(
          projectWithSynchronizedFolders,
        );

        // -- Assert --
        // The build settings are a massive list of key-value pairs, so we'll just check a few of them
        // which are relevant for our use cases.
        expect(buildSettings?.['CONFIGURATION_BUILD_DIR']).toEqual(
          path.join(
            appleProjectsPath,
            'xcode-15-compatible-project/build/Release-unknown',
          ),
        );
        expect(buildSettings?.['TARGET_BUILD_DIR']).toEqual(
          path.join(
            appleProjectsPath,
            'xcode-15-compatible-project/build/Release-unknown',
          ),
        );
      },
    );

    test.runIf(process.platform !== 'darwin')(
      'should return undefined on non-macOS platforms',
      () => {
        // The purpose of this test is to verify that the implementation of readXcodeBuildSettings() is still unchanged

        // -- Act --
        const buildSettings = MacOSSystemHelpers.readXcodeBuildSettings(
          projectWithSynchronizedFolders,
        );

        // -- Assert --
        expect(buildSettings).toBeUndefined();
      },
    );

    describe('project path', () => {
      it('should escape quotes', () => {
        // -- Arrange --
        const projectPath = 'some path" && echo "Hello World"';

        // Use spyOn instead of vi.mock
        const execSyncSpy = vi
          .spyOn(childProcess, 'execSync')
          .mockImplementation(() => {
            return '   "mocked_key" = "mocked_value"';
          });

        // -- Act --
        const buildSettings =
          MacOSSystemHelpers.readXcodeBuildSettings(projectPath);

        // -- Assert --
        expect(buildSettings).toEqual({
          mocked_key: 'mocked_value',
        });
        // We expect the project path to be escaped
        expect(execSyncSpy).toHaveBeenCalledWith(
          `xcodebuild -project "some path\\" && echo \\"Hello World\\"" -showBuildSettings`,
          { encoding: 'utf8' },
        );
      });
    });
  });
});
