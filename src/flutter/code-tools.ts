import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  sentryImport,
  // testErrorSnippet,
} from './templates';

/**
 * Recursively finds a file per name in subfolders.
 * @param dir - The directory to start searching.
 * @param name - The name of the file including path extension.
 * @returns The path to the main.dart file or null if not found.
 */
export function findFile(dir: string, name: string): string | null {
  const files: string[] = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath: string = path.join(dir, file);
    const stats: fs.Stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      const result: string | null = findFile(fullPath, name);
      if (result) {
        return result;
      }
    } else if (file === name) {
      return fullPath;
    }
  }

  return null;
}

export function patchPubspec(pubspecFile: string | null): boolean {
  if (!pubspecFile || !fs.existsSync(pubspecFile)) {
    clack.log.warn('No pubspec.yaml source file found in filesystem.');
    Sentry.captureException('No pubspec.yaml source file');
    return false;
  }
  
  return true;
}

export function patchMain(mainFile: string | null): boolean {
  if (!mainFile || !fs.existsSync(mainFile)) {
    clack.log.warn('No main.dart source file found in filesystem.');
    Sentry.captureException('No main.dart source file');
    return false;
  }

  const mainContent = fs.readFileSync(mainFile, 'utf8');

  if (/import\s+['"]package[:]sentry_flutter\/sentry_flutter\.dart['"];?/i.test(mainContent)) {
    // sentry is already configured
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'main.dart',
        )} is already patched with test error snippet.`,
      ),
    );
    return true;
  }

  const importIndex = getLastImportLineLocation(mainContent);
  const newActivityContent = mainContent.slice(0, importIndex) +
    sentryImport +
    mainContent.slice(importIndex);

  // TODO: @denis setup

  // TODO: @denis snippet

  fs.writeFileSync(mainFile, newActivityContent, 'utf8');

  clack.log.success(
    chalk.greenBright(
      `Patched ${chalk.bold(
        'main.dart',
      )} with the Sentry setup and test error snippet.`,
    ),
  );

  return true;
}

/**
 * Returns the string index of the last import statement in the given code file.
 *
 * @param sourceCode
 * @returns the insert index, or 0 if none found.
 */
export function getLastImportLineLocation(sourceCode: string): number {
  const importRegex = /import\s+['"].*['"].*;/gim;

  let importsMatch = importRegex.exec(sourceCode);
  let importIndex = 0;
  while (importsMatch) {
    importIndex = importsMatch.index + importsMatch[0].length + 1;
    importsMatch = importRegex.exec(sourceCode);
  }
  return importIndex;
  return 0;
}
