import * as fs from 'fs';
const glob = require('glob');

const IGNORE_PATTERN = ['node_modules/**', 'ios/Pods/**', '**/Pods/**'];

export function patchMatchingFile(globPattern: string, func: any, ...args: any[]) {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
  let rv = Promise.resolve();
  matches.forEach((match: string) => {
    const contents = fs.readFileSync(match, {
      encoding: 'utf-8',
    });
    rv = rv.then(() => func(contents, match, args)).then(newContents => {
      if (newContents !== null && contents !== undefined && contents !== newContents) {
        fs.writeFileSync(match, newContents);
      }
    });
  });
  return rv;
}

export function exists(globPattern: string) {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
  return matches.reduce((prev: boolean, match: string) => {
    return prev && fs.existsSync(match);
  }, true);
}

export function matchesContent(globPattern: string, contentPattern: RegExp) {
  const matches = glob.sync(globPattern, {
    ignore: IGNORE_PATTERN,
  });
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
