import * as fs from 'fs';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

/**
 * Checks if a file where we don't know its concrete file type yet exists
 * and returns the full path to the file with the correct file type.
 */
export function findFile(
  filePath: string,
  fileTypes: string[] = ['.js', '.ts', '.mjs', '.cjs'],
): string | undefined {
  return fileTypes
    .map((type) => `${filePath}${type}`)
    .find((file) => fs.existsSync(file));
}

/**
 * checks for require('@sentry/*') syntax
 */
export function hasSentryContent(program: t.Program): boolean {
  let foundSentry: boolean | undefined = false;
  recast.visit(program, {
    visitStringLiteral(path) {
      foundSentry = foundSentry || path.node.value.startsWith('@sentry/');
      this.traverse(path);
    },
    visitLiteral(path) {
      foundSentry =
        foundSentry || path.node.value?.toString().startsWith('@sentry/');
      this.traverse(path);
    },
  });

  return !!foundSentry;
}
