import * as fs from 'fs';
import * as path from 'path';
import { major, minVersion } from 'semver';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders } from 'magicast';

export function getNextJsVersionBucket(version: string | undefined) {
  if (!version) {
    return 'none';
  }

  try {
    const minVer = minVersion(version);
    if (!minVer) {
      return 'invalid';
    }
    const majorVersion = major(minVer);
    if (majorVersion >= 11) {
      return `${majorVersion}.x`;
    }
    return '<11.0.0';
  } catch {
    return 'unknown';
  }
}

export function getMaybeAppDirLocation() {
  const maybeAppDirPath = path.join(process.cwd(), 'app');
  const maybeSrcAppDirPath = path.join(process.cwd(), 'src', 'app');

  return fs.existsSync(maybeAppDirPath) &&
    fs.lstatSync(maybeAppDirPath).isDirectory()
    ? ['app']
    : fs.existsSync(maybeSrcAppDirPath) &&
      fs.lstatSync(maybeSrcAppDirPath).isDirectory()
    ? ['src', 'app']
    : undefined;
}

export function hasRootLayoutFile(appFolderPath: string) {
  return ['jsx', 'tsx', 'js'].some((ext) =>
    fs.existsSync(path.join(appFolderPath, `layout.${ext}`)),
  );
}

/**
 * Unwraps a withSentryConfig call expression using magicast.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrapSentryConfigAst(astNode: unknown): any {
  // Check if this is a CallExpression with withSentryConfig
  if (
    isAstNode(astNode) &&
    astNode.type === 'CallExpression' &&
    astNode.callee?.type === 'Identifier' &&
    astNode.callee?.name === 'withSentryConfig'
  ) {
    // Return the first argument (the config being wrapped)
    return astNode.arguments?.[0] || astNode;
  }

  return astNode;
}

/**
 * Wraps a magicast module export with withSentryConfig using magicast
 */
export function wrapWithSentryConfig(
  moduleExport: unknown,
  optionsTemplate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return builders.functionCall(
    'withSentryConfig',
    moduleExport,
    builders.raw(optionsTemplate),
  );
}

function isAstNode(astNode: unknown): astNode is {
  type: string;
  callee?: { type: string; name?: string };
  arguments?: unknown[];
} {
  return (
    typeof astNode === 'object' &&
    astNode !== null &&
    'type' in astNode &&
    'callee' in astNode &&
    typeof astNode.callee === 'object' &&
    astNode.callee !== null &&
    'type' in astNode.callee &&
    'name' in astNode.callee
  );
}
