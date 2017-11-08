const glob = require('glob');
const fs = require('fs');

export function patchMatchingFile(pattern: string, func: any) {
  const matches = glob.sync(pattern, {
    ignore: ['node_modules/**', 'ios/Pods/**', '**/Pods/**']
  });
  let rv = Promise.resolve();
  matches.forEach((match: string) => {
    const contents = fs.readFileSync(match, {
      encoding: 'utf-8'
    });
    rv = rv.then(() => func(contents, match)).then(newContents => {
      if (newContents !== null && contents !== undefined && contents !== newContents) {
        fs.writeFileSync(match, newContents);
      }
    });
  });
  return rv;
}
