import glob from 'glob';

export const XCODE_PROJECT = 'ios/*.xcodeproj/project.pbxproj';
export const APP_BUILD_GRADLE = '**/app/build.gradle';

const IGNORE_PATTERNS = ['node_modules/**', 'ios/Pods/**', '**/Pods/**'];
export function getFirstMatchedPath(pattern: string): string | undefined {
  const matches = glob.sync(pattern, {
    ignore: IGNORE_PATTERNS,
  });

  return matches[0];
}
