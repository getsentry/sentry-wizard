import * as fs from 'fs';
import * as glob from 'glob';

const IGNORE_PATTERN = ['node_modules/**', 'ios/Pods/**', '**/Pods/**'];

export function patchMatchingFile<T>(
  globPattern: string,
  func: (contents: string, match: string, ...args: unknown[]) => Promise<T>,
  ...args: unknown[]
): Promise<void> {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
  let rv = Promise.resolve();
  matches.forEach((match: string) => {
    const contents = fs.readFileSync(match, {
      encoding: 'utf-8',
    });
    rv = rv
      .then(() => func(contents, match, ...args))
      .then((newContents: T) => {
        if (
          newContents !== null &&
          newContents !== undefined &&
          contents !== newContents
        ) {
          fs.writeFileSync(match, newContents);
        }
      });
  });
  return rv;
}

export function matchFiles(globPattern: string): string[] {
  return glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
}

export function exists(globPattern: string): boolean {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
  if (matches.length === 0) {
    return false;
  }
  return matches.reduce((prev: boolean, match: string) => {
    return prev && fs.existsSync(match);
  }, true);
}

export function matchesContent(
  globPattern: string,
  contentPattern: RegExp,
): boolean {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
  if (matches.length === 0) {
    return false;
  }
  return matches.reduce((prev: boolean, match: string) => {
    return !!(prev && fs.readFileSync(match).toString().match(contentPattern));
  }, true);
}
