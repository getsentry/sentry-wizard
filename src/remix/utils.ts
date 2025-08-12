import type { Program } from '@babel/types';

import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import pc from 'picocolors';
import { PackageDotJson, hasPackageInstalled } from '../utils/package-json';

export const POSSIBLE_SERVER_INSTRUMENTATION_PATHS = [
  './instrumentation',
  './instrumentation.server',
];

export function hasSentryContent(
  fileName: string,
  fileContent: string,
  expectedContent = '@sentry/remix',
): boolean {
  const includesContent = fileContent.includes(expectedContent);

  if (includesContent) {
    clack.log.warn(
      `File ${pc.cyan(
        path.basename(fileName),
      )} already contains ${expectedContent}.
Skipping adding Sentry functionality to ${pc.cyan(path.basename(fileName))}.`,
    );
  }

  return includesContent;
}

export function serverHasInstrumentationImport(
  serverFileName: string,
  serverFileContent: string,
): boolean {
  const includesServerInstrumentationImport =
    POSSIBLE_SERVER_INSTRUMENTATION_PATHS.some((path) =>
      serverFileContent.includes(path),
    );

  if (includesServerInstrumentationImport) {
    clack.log.warn(
      `File ${pc.cyan(
        path.basename(serverFileName),
      )} already contains instrumentation import.
Skipping adding instrumentation functionality to ${pc.cyan(
        path.basename(serverFileName),
      )}.`,
    );
  }

  return includesServerInstrumentationImport;
}

/**
 * We want to insert the init call on top of the file, before any other imports.
 */
export function getBeforeImportsInsertionIndex(
  originalHooksModAST: Program,
): number {
  for (let x = 0; x < originalHooksModAST.body.length - 1; x++) {
    if (
      originalHooksModAST.body[x].type === 'ImportDeclaration' &&
      // @ts-expect-error - source is available in body
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      originalHooksModAST.body[x].source.value === '@sentry/remix'
    ) {
      return x + 1;
    }
  }

  return 0;
}

/**
 * We want to insert the handleError function just after all imports
 */
export function getAfterImportsInsertionIndex(
  originalEntryServerModAST: Program,
): number {
  for (let x = originalEntryServerModAST.body.length - 1; x >= 0; x--) {
    if (originalEntryServerModAST.body[x].type === 'ImportDeclaration') {
      return x + 1;
    }
  }

  return 0;
}

export function isHydrogenApp(packageJson: PackageDotJson): boolean {
  return hasPackageInstalled('@shopify/hydrogen', packageJson);
}
