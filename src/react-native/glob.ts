import * as glob from 'glob';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

export const XCODE_PROJECT = 'ios/*.xcodeproj/project.pbxproj';
export const APP_BUILD_GRADLE = '**/app/build.gradle';

const IGNORE_PATTERNS = ['node_modules/**', 'ios/Pods/**', '**/Pods/**'];
export function getFirstMatchedPath(pattern: string): string | undefined {
  try {
    const matches = glob.sync(pattern, {
      ignore: IGNORE_PATTERNS,
    });

    return matches[0];
  } catch (error) {
    clack.log.error(`Error while matching path pattern "${pattern}"`);
    return undefined;
  }
}
