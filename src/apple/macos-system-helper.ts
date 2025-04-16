import { execSync } from 'child_process';
import { debug } from '../utils/debug';

export class MacOSSystemHelpers {
  static findSDKRootDirectoryPath(): string | undefined {
    try {
      const sdkPath = execSync('xcrun --show-sdk-path', {
        encoding: 'utf8',
      }).trim();
      return sdkPath;
    } catch (error) {
      debug(`Failed to find SDK root directory path: ${error as string}`);
      return undefined;
    }
  }

  static findDeveloperDirectoryPath(): string | undefined {
    try {
      const developerPath = execSync('xcode-select --print-path', {
        encoding: 'utf8',
      }).trim();
      return developerPath;
    } catch (error) {
      debug(`Failed to find developer directory path: ${error as string}`);
      return undefined;
    }
  }

  static readXcodeBuildSettings(
    projectPath: string,
  ): Record<string, string> | undefined {
    try {
      const output = execSync(
        `xcodebuild -project "${projectPath}" -showBuildSettings`,
        {
          encoding: 'utf8',
        },
      ).trim();
      // --- Example Output: ---
      // Command line invocation:
      // /Applications/Xcode-16.3.0.app/Contents/Developer/usr/bin/xcodebuild -project ./fixtures/test-applications/apple/project-with-synchronized-folders/Project.xcodeproj -showBuildSettings
      //
      // Build settings for action build and target Project:
      //     ACTION = build
      //     ALLOW_BUILD_REQUEST_OVERRIDES = NO
      //     ALLOW_TARGET_PLATFORM_SPECIALIZATION = YES
      //     ALTERNATE_GROUP = staff
      //     ...
      const lines = output.split('\n');
      const settings: Record<string, string> = {};
      lines.forEach((line) => {
        const match = line.match(/^\s*(\w+)\s+=\s+(.*)$/);
        if (match) {
          settings[match[1]] = match[2];
        }
      });

      return settings;
    } catch (error) {
      debug(`Failed to read Xcode build settings: ${error as string}`);
      return undefined;
    }
  }
}
