import { describe, expect, test } from 'vitest';
import { MacOSSystemHelpers } from '../../src/apple/macos-system-helper';

import path from 'node:path';

const appleProjectsPath = path.resolve(
  __dirname,
  '../../fixtures/test-applications/apple',
);
const projectWithSynchronizedFolders = path.join(
  appleProjectsPath,
  'xcode-15-compatible-project/Project.xcodeproj',
);

// The path to the Xcode.app can be different on different machines, so we allow overwriting it using environment variables
const xcodeAppPath = process.env.XCODE_APP_PATH ?? '/Applications/Xcode.0.app';

describe('MacOSSystemHelpers', () => {
  describe('findSDKRootDirectoryPath', () => {
    test.runIf(process.platform === 'darwin')(
      'should return the SDK root directory path',
      () => {
        // -- Act --
        const sdkRootDirectoryPath =
          MacOSSystemHelpers.findSDKRootDirectoryPath();

        // -- Assert --
        expect(sdkRootDirectoryPath).toBe(
          path.join(
            xcodeAppPath,
            'Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
          ),
        );
      },
    );
  });

  describe('findDeveloperDirectoryPath', () => {
    test.runIf(process.platform === 'darwin')(
      'should return the developer directory path',
      () => {
        // -- Act --
        const developerDirectoryPath =
          MacOSSystemHelpers.findDeveloperDirectoryPath();

        // -- Assert --
        expect(developerDirectoryPath).toBe(
          path.join(xcodeAppPath, 'Contents/Developer'),
        );
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
  });
});
