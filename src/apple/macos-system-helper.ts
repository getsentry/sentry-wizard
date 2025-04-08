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
}
