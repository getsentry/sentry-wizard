import * as fs from 'fs';
import * as path from 'path';
import { major, minVersion } from 'semver';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, parseModule } from 'magicast';

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

/**
 * Detects whether cacheComponents is enabled in the Next.js config.
 * Returns true if cacheComponents is set to true, false otherwise.
 */
export function hasCacheComponentsEnabled(): boolean {
  const nextConfigFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
    'next.config.cjs',
    'next.config.cts',
  ];

  for (const configFile of nextConfigFiles) {
    const configPath = path.join(process.cwd(), configFile);
    if (!fs.existsSync(configPath)) {
      continue;
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf8');

      // First try a simple string check for common patterns
      // This catches: cacheComponents: true, experimental: { cacheComponents: true }
      if (
        /cacheComponents\s*:\s*true/.test(configContent) ||
        /experimental\s*:\s*\{\s*cacheComponents\s*:\s*true/.test(configContent)
      ) {
        return true;
      }

      // Try parsing with magicast for more complex cases
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const mod = parseModule(configContent);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const nextConfig = mod.exports?.default?.$type
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            mod.exports.default
          : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            mod.exports;

        // Check for cacheComponents at root level or in experimental
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (nextConfig?.cacheComponents === true) {
          return true;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (nextConfig?.experimental?.cacheComponents === true) {
          return true;
        }
      } catch {
        // If magicast parsing fails, we already checked with regex above
      }
    } catch {
      // If we can't read the file, continue to the next one
      continue;
    }
  }

  return false;
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
