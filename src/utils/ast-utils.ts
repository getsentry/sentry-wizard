import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { ProxifiedModule } from 'magicast';

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

/** Checks if a Sentry package is already mentioned in the file */
export function hasSentryContent(mod: ProxifiedModule<object>): boolean {
  const imports = mod.imports.$items.map((i) => i.from);
  return !!imports.find((i) => i.startsWith('@sentry/'));
}

/**
 * checks for require('@sentry/*') syntax
 */
export function hasSentryContentCjs(program: t.Program): boolean {
  let foundRequire = false;
  recast.visit(program, {
    visitCallExpression(path) {
      const callee = path.node.callee;
      if (
        callee.type === 'Identifier' &&
        callee.name === 'require' &&
        path.node.arguments[0].type === 'Literal' &&
        path.node.arguments[0].value?.toString().startsWith('@sentry/')
      ) {
        foundRequire = true;
      }
      this.traverse(path);
    },
  });

  return !!foundRequire;
}
