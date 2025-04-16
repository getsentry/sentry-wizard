import { describe, expect, it } from 'vitest';
import { MacOSSystemHelpers } from '../../src/apple/macos-system-helper';

import path from 'node:path';

const appleProjectsPath = path.resolve(
  __dirname,
  '../../fixtures/test-applications/apple',
);
const projectWithSynchronizedFolders = path.join(
  appleProjectsPath,
  'project-with-synchronized-folders/Project.xcodeproj',
);

// The path to the Xcode.app can be different on different machines, so we allow overwriting it using environment variables
const xcodeAppPath = process.env.XCODE_APP_PATH ?? '/Applications/Xcode.app';

describe('MacOSSystemHelpers', () => {
  describe('findSDKRootDirectoryPath', () => {
    it('should return the SDK root directory path', () => {
      // Skip this test if the OS is not macOS because it requires Xcode to be installed
      if (process.platform !== 'darwin') {
        it.skip('skipped on non-macOS platforms');
        return;
      }

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
    });
  });

  describe('findDeveloperDirectoryPath', () => {
    it('should return the developer directory path', () => {
      // Skip this test if the OS is not macOS because it requires Xcode to be installed
      if (process.platform !== 'darwin') {
        it.skip('skipped on non-macOS platforms');
        return;
      }

      // -- Act --
      const developerDirectoryPath =
        MacOSSystemHelpers.findDeveloperDirectoryPath();

      // -- Assert --
      expect(developerDirectoryPath).toBe(
        path.join(xcodeAppPath, 'Contents/Developer'),
      );
    });
  });

  describe('readXcodeBuildSettings', () => {
    it('should return the build settings', () => {
      // Skip this test if the OS is not macOS because it requires Xcode to be installed
      if (process.platform !== 'darwin') {
        it.skip('skipped on non-macOS platforms');
        return;
      }

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
          'project-with-synchronized-folders/build/Release-unknown',
        ),
      );
      expect(buildSettings?.['TARGET_BUILD_DIR']).toEqual(
        path.join(
          appleProjectsPath,
          'project-with-synchronized-folders/build/Release-unknown',
        ),
      );
      expect(buildSettings?.['BUILD_DIR']).toEqual(
        path.join(appleProjectsPath, 'project-with-synchronized-folders/build'),
      );
    });
  });
});
