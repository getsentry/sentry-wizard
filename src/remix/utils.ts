import type { Program } from '@babel/types';

import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { PackageDotJson, hasPackageInstalled } from '../utils/package-json';

// Copied from sveltekit wizard
export function hasSentryContent(
  fileName: string,
  fileContent: string,
): boolean {
  const includesContent = fileContent.includes('@sentry/remix');

  if (includesContent) {
    clack.log.warn(
      `File ${chalk.cyan(path.basename(fileName))} already contains Sentry code.
Skipping adding Sentry functionality to ${chalk.cyan(
        path.basename(fileName),
      )}.`,
    );
  }

  return includesContent;
}

/**
 * We want to insert the init call on top of the file but after all import statements
 */
export function getInitCallInsertionIndex(
  originalHooksModAST: Program,
): number {
  for (let x = originalHooksModAST.body.length - 1; x >= 0; x--) {
    if (originalHooksModAST.body[x].type === 'ImportDeclaration') {
      return x + 1;
    }
  }

  return 0;
}

export function isHydrogenApp(packageJson: PackageDotJson): boolean {
  return hasPackageInstalled('@shopify/hydrogen', packageJson);
}
