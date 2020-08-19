import * as fs from 'fs';
const glob = require('glob');

const IGNORE_PATTERN = ['node_modules/**', 'ios/Pods/**', '**/Pods/**'];

export function patchMatchingFile(
  globPattern: string,
  func: any,
  ...args: any[]
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
      .then(newContents => {
        if (
          newContents !== null &&
          contents !== undefined &&
          contents !== newContents
        ) {
          fs.writeFileSync(match, newContents);
        }
      });
  });
  return rv;
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
    return (
      prev &&
      fs
        .readFileSync(match)
        .toString()
        .match(contentPattern)
    );
  }, true);
}
