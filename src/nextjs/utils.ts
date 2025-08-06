import * as fs from 'fs';
import * as path from 'path';
import { major, minVersion } from 'semver';

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
 * Unwraps a simple expression containing withSentryConfig.
 * Prevent double wrapping like: `withSentryConfig(withSentryConfig(nextConfig), { ... })`
 * Used for MJS/TS export statements.
 */
export function unwrapSentryConfigExpression(expression: string): string {
  // Find the start of withSentryConfig(
  const startMatch = expression.match(/withSentryConfig\s*\(/);
  if (!startMatch || startMatch.index === undefined) {
    return expression;
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const innerContent = extractInnerContent(expression, startIndex);

  if (innerContent === null) {
    // Malformed expression, return as-is
    return expression;
  }

  return getFirstArgument(innerContent);
}

/**
 * Extracts content between matching parentheses starting from a given index
 */
function extractInnerContent(
  expression: string,
  startIndex: number,
): string | null {
  let parenCount = 1;
  let currentIndex = startIndex;

  while (currentIndex < expression.length && parenCount > 0) {
    const char = expression[currentIndex];
    if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
    }
    currentIndex++;
  }

  return parenCount === 0
    ? expression.substring(startIndex, currentIndex - 1)
    : null;
}

/**
 * Gets the first argument (nextConfig) from a comma-separated list, respecting nested parentheses
 */
function getFirstArgument(content: string): string {
  let parenCount = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
    } else if (char === ',' && parenCount === 0) {
      return content.substring(0, i).trim();
    }
  }

  return content.trim();
}
